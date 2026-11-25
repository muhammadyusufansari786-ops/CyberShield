/**
 * CyberShield - Real-time threat intelligence service (Day 2)
 *
 * OFFICIAL SOURCES (no third-party aggregators, no invented data):
 *  1. CISA Known Exploited Vulnerabilities (KEV) catalog
 *     https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
 *  2. NIST NVD CVE API v2.0 (recently PUBLISHED CVEs, newest first)
 *     https://services.nvd.nist.gov/rest/json/cves/2.0
 *
 * DESIGN:
 *  - Every record is upserted into MongoDB keyed by CVE ID, so upstream data
 *    can never be duplicated. Nothing is modified or synthesized beyond
 *    normalization (field mapping, ISO dates).
 *  - Responses are CACHED in MongoDB; the dashboard reads ONLY from the
 *    database, so the external APIs are touched at most a few times per hour
 *    no matter how many visitors browse the page.
 *  - A lazy refresh scheduler keeps feeds current (KEV verifies its
 *    dateReleased before re-parsing the 1.8 MB JSON; NVD is re-polled every
 *    THREAT_NVD_REFRESH_MS and only 2 requests are used per poll).
 *  - Timeouts, transient upstream failures (429/5xx), and dead sources are
 *    handled gracefully: the last-known-good cache is always served and the
 *    sync state records the error for the dashboard's health indicator.
 *  - NVD rate limits are respected: keyless allowance is 5 requests / 30 s;
 *    each poll uses 2 (a one-result probe to learn totalResults, then one
 *    final page). An optional NVD_API_KEY raises the limit but is NEVER
 *    required and never leaves the server.
 */

import mongoose from 'mongoose';
import { ThreatItem, ThreatSyncState } from '../models/ThreatIntel.js';

/* ------------------------------------------------------------------ */
/* Configuration (env-optional; .env itself is never touched here)     */
/* ------------------------------------------------------------------ */

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const NVD_API_KEY = process.env.NVD_API_KEY && process.env.NVD_API_KEY !== 'YOUR_KEY_HERE' ? process.env.NVD_API_KEY : null;

const FETCH_TIMEOUT_MS = Number(process.env.THREAT_FETCH_TIMEOUT_MS) || 15000;
const KEV_REFRESH_MS = Number(process.env.THREAT_KEV_REFRESH_MS) || 3 * 60 * 60 * 1000; // 3 h
const NVD_REFRESH_MS = Number(process.env.THREAT_NVD_REFRESH_MS) || 90 * 60 * 1000; // 90 min
const NVD_WINDOW_DAYS = Number(process.env.THREAT_NVD_WINDOW_DAYS) || 14; // publish window / poll
const NVD_MAX_PER_POLL = Math.min(Number(process.env.THREAT_NVD_MAX_PER_POLL) || 500, 2000);

const SOURCES = {
  'cisa-kev': { label: 'CISA Known Exploited Vulnerabilities', url: KEV_URL },
  nvd: { label: 'NIST NVD (CVE API v2.0)', url: NVD_URL },
};

/* ------------------------------------------------------------------ */
/* Fetch with timeout + gentle retry for transient upstream failures   */
/* ------------------------------------------------------------------ */

async function fetchJson(url, { headers = {}, attempts = 2 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'CyberShield-Intel/1.0 (cybersecurity awareness demo)',
          ...(NVD_API_KEY && /nvd\.nist\.gov/.test(url) ? { apiKey: NVD_API_KEY } : {}),
          ...headers,
        },
      });
      clearTimeout(timer);

      if (res.status === 429) {
        // Respect upstream rate limiting: wait out the indicated window.
        const retryAfter = Math.min((Number(res.headers.get('retry-after')) || 6) * 1000, 30000);
        await new Promise((r) => setTimeout(r, retryAfter));
        lastErr = new Error('upstream rate limit (429)');
        continue;
      }
      if (!res.ok) {
        lastErr = new Error(`upstream ${res.status}`);
        if (res.status >= 500 && i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
          continue;
        }
        throw lastErr;
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError';
      if ((isTimeout || err?.code === 'ECONNRESET') && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ */
/* Normalizers - field mapping ONLY (no data is invented or altered)   */
/* ------------------------------------------------------------------ */

const NVD_DETAIL_BASE = 'https://nvd.nist.gov/vuln/detail/';

function severityFromNvd(cve) {
  const m = cve.metrics || {};
  const pick = (metric, fromScore) => {
    if (!metric || !metric[0]) return null;
    const d = metric[0].cvssData || {};
    const score = Number(d.baseScore);
    const severity = String(d.baseSeverity || metric[0].baseSeverity || '').toLowerCase();
    return {
      cvss: Number.isFinite(score) ? score : null,
      // NVD's own baseSeverity is authoritative; the score is only a fallback
      // for older CVSS v2 records, and 0.0 is officially "NONE", not "Low".
      severity: ['critical', 'high', 'medium', 'low', 'none'].includes(severity)
        ? severity
        : (Number.isFinite(score)
            ? (score >= 9.0 ? 'critical' : score >= 7.0 ? 'high' : score >= 4.0 ? 'medium' : score > 0 ? 'low' : 'none')
            : null),
      version: String(d.version || metric[0].type || '').slice(0, 16) || null,
    };
  };
  return (
    pick(m.cvssMetricV40) ||
    pick(m.cvssMetricV31) ||
    pick(m.cvssMetricV30) ||
    pick(m.cvssMetricV2) || { cvss: null, severity: null, version: null }
  );
}

function mapNvdEntry(v) {
  const cve = v.cve || {};
  const en = (cve.descriptions || []).find((d) => d.lang === 'en');
  const { cvss, severity, version } = severityFromNvd(cve);
  const ref = (cve.references || [])[0];
  return {
    _id: cve.id,
    source: 'nvd',
    feedDate: new Date(cve.published),
    title: `${cve.id}${(cve.affected || [])[0]?.vendor ? ' - ' + String(cve.affected[0].vendor).slice(0, 60) : ''}`,
    description: String(en?.value || '').slice(0, 4000),
    severity: severity || null,
    cvss: cvss,
    cvssVersion: version,
    published: cve.published ? new Date(cve.published) : null,
    lastModified: cve.lastModified ? new Date(cve.lastModified) : null,
    vendor: String((cve.affected || [])[0]?.vendor || '').slice(0, 200),
    product: String((cve.affected || [])[0]?.product || '').slice(0, 200),
    kev: (cve.cveTags || []).some((t) => t?.sourceIdentifier === 'cisaExploitTags') || false,
    url: cve.id ? NVD_DETAIL_BASE + cve.id : (ref?.url || null),
    sourceUpdatedAt: new Date(),
  };
}

/** KEV "notes" often carries a plain URL - surface the FIRST one as the link. */
function firstUrl(fromNotes) {
  const m = String(fromNotes || '').match(/https?:\/\/[^\s;,)]+/);
  return m ? m[0].slice(0, 500) : null;
}

function mapKevEntry(entry, dateReleased) {
  return {
    _id: entry.cveID,
    source: 'cisa-kev',
    feedDate: new Date(entry.dateAdded),
    title: entry.vulnerabilityName
      ? `${entry.cveID} - ${String(entry.vulnerabilityName).slice(0, 240)}`
      : entry.cveID,
    description: String(entry.shortDescription || entry.requiredAction || '').slice(0, 4000),
    severity: null, // KEV carries no CVSS - never invent one
    cvss: null,
    cvssVersion: null,
    published: null,
    lastModified: dateReleased ? new Date(dateReleased) : null,
    vendor: String(entry.vendorProject || '').slice(0, 200),
    product: String(entry.product || '').slice(0, 200),
    kev: true,
    kevDateAdded: entry.dateAdded ? new Date(entry.dateAdded) : null,
    kevDueDate: entry.dueDate ? new Date(entry.dueDate) : null,
    requiredAction: String(entry.requiredAction || '').slice(0, 1000),
    ransomwareUse: String(entry.knownRansomwareCampaignUse || '').toUpperCase() === 'KNOWN',
    cwes: Array.isArray(entry.cwes) ? entry.cwes.slice(0, 4).map((c) => String(c).slice(0, 20)) : [],
    url: firstUrl(entry.notes) || 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    sourceUpdatedAt: new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* Sync state helpers                                                  */
/* ------------------------------------------------------------------ */

async function getState(source) {
  return (await ThreatSyncState.findOne({ source }).lean()) || null;
}

async function recordSuccess(source, { sourceModifiedAt, itemCount }) {
  // itemCount reflects the whole cached population for this source, not just
  // the last batch (NVD rolls a window, so docs accumulate between polls).
  const cachedCount = await ThreatItem.countDocuments({ source }).catch(() => itemCount ?? 0);
  await ThreatSyncState.updateOne(
    { source },
    {
      $set: {
        lastFetchedAt: new Date(),
        lastSuccessAt: new Date(),
        sourceModifiedAt: sourceModifiedAt || null,
        itemCount: cachedCount,
        nextFetchAt: new Date(Date.now() + (source === 'cisa-kev' ? KEV_REFRESH_MS : NVD_REFRESH_MS)),
      },
      $unset: { lastError: 1, lastErrorAt: 1 },
    },
    { upsert: true }
  );
}

async function recordFailure(source, err) {
  // Text-only, credential-free details (upstream status codes are safe).
  await ThreatSyncState.updateOne(
    { source },
    {
      $set: {
        lastFetchedAt: new Date(),
        lastError: String(err?.message || 'fetch failed').slice(0, 300),
        lastErrorAt: new Date(),
        // Back off before the next attempt so a dead source is polled gently.
        nextFetchAt: new Date(Date.now() + (source === 'cisa-kev' ? KEV_REFRESH_MS : 15 * 60 * 1000)),
      },
    },
    { upsert: true }
  );
}

/* ------------------------------------------------------------------ */
/* In-flight guard - parallel page loads NEVER double-fetch upstream   */
/* ------------------------------------------------------------------ */

const inFlight = new Map();

/* ------------------------------------------------------------------ */
/* Source fetchers                                                     */
/* ------------------------------------------------------------------ */

async function fetchKev() {
  const data = await fetchJson(KEV_URL);
  if (!data || !Array.isArray(data.vulnerabilities)) {
    throw new Error('KEV feed returned unexpected structure');
  }
  const dateReleased = data.dateReleased ? new Date(data.dateReleased) : null;

  // Skip parsing/upsert entirely when upstream hasn't changed.
  const prev = await getState('cisa-kev');
  if (prev?.sourceModifiedAt && dateReleased && prev.sourceModifiedAt.getTime() === dateReleased.getTime()) {
    return { skipped: true, sourceModifiedAt: dateReleased, count: prev.itemCount };
  }

  const docs = data.vulnerabilities
    .filter((e) => /^CVE-\d{4}-\d{4,}$/.test(String(e?.cveID || '')))
    .map((e) => mapKevEntry(e, dateReleased));

  await bulkUpsert(docs);

  // Entries that no longer appear upstream are stale; drop them so the
  // cache mirrors the official catalog rather than accumulating.
  await ThreatItem.deleteMany({ source: 'cisa-kev', _id: { $nin: docs.map((d) => d._id) } });

  return { skipped: false, sourceModifiedAt: dateReleased, count: docs.length };
}

async function fetchNvd() {
  // Window start (ISO 8601, ms precision) - NVD's actual accepted format.
  const end = new Date();
  const start = new Date(end.getTime() - NVD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().replace('Z', '').slice(0, 23);

  // Probe: 1-result request to learn totalResults (lowest-memory way to
  // discover where the NEWEST entries live - NVD sorts ascending by
  // publish date throughout a window).
  const probe = await fetchJson(
    `${NVD_URL}?pubStartDate=${iso(start)}&pubEndDate=${iso(end)}&resultsPerPage=1`
  );
  const totalResults = Number(probe.totalResults) || 0;
  if (totalResults === 0) {
    return { skipped: true, count: 0, sourceModifiedAt: new Date() };
  }

  // One final page = the newest NVD_MAX_PER_POLL entries of the window.
  const startIndex = Math.max(totalResults - NVD_MAX_PER_POLL, 0);
  const limit = Math.min(totalResults - startIndex, NVD_MAX_PER_POLL);
  const page = await fetchJson(
    `${NVD_URL}?pubStartDate=${iso(start)}&pubEndDate=${iso(end)}&resultsPerPage=${limit}&startIndex=${startIndex}`
  );

  let latestModified = null;
  const docs = (page.vulnerabilities || [])
    .filter((v) => /^CVE-\d{4}-\d{4,}$/.test(String(v?.cve?.id || '')))
    .map((v) => {
      const d = mapNvdEntry(v);
      if (d.lastModified && (!latestModified || d.lastModified > latestModified)) latestModified = d.lastModified;
      // KEV entries already have richer KEV metadata - don't downgrade them.
      return d;
    });

  // NVD can describe brief CVE details; still upsert - severity/cvss from NVD
  // simply REPLACE the null values the KEV-only record carries.
  await bulkUpsert(docs);

  // Keep the local NVD cache to a rolling window: purge entries that fell
  // out of it (they remain retrievable upstream for archive feeds).
  const cutoff = new Date(end.getTime() - NVD_WINDOW_DAYS * 1.5 * 24 * 60 * 60 * 1000);
  await ThreatItem.deleteMany({ source: 'nvd', feedDate: { $lt: cutoff } });

  return { skipped: false, count: docs.length, sourceModifiedAt: latestModified || new Date() };
}

const bulkOpsOf = (docs) =>
  docs.map((doc) => ({
    replaceOne: {
      filter: { _id: doc._id },
      replacement: { ...doc, sourceUpdatedAt: new Date() },
      upsert: true,
    },
  }));

async function bulkUpsert(docs) {
  if (!docs.length) return;
  const col = mongoose.connection.collection('threatitems');
  // Batches of 500 keep document sizes small and memory flat.
  for (let i = 0; i < docs.length; i += 500) {
    await col.bulkWrite(bulkOpsOf(docs.slice(i, i + 500)), { ordered: false });
  }
}

/* ------------------------------------------------------------------ */
/* Refresh orchestration                                               */
/* ------------------------------------------------------------------ */

async function refreshSource(source) {
  if (inFlight.has(source)) return inFlight.get(source);
  const job = (async () => {
    try {
      const result = source === 'cisa-kev' ? await fetchKev() : await fetchNvd();
      await recordSuccess(source, { sourceModifiedAt: result.sourceModifiedAt, itemCount: result.count });
      console.log(
        `[threat-intel] ${source}: ${result.skipped ? 'skipped (upstream unchanged)' : 'refreshed ' + result.count + ' items'}`
      );
    } catch (err) {
      await recordFailure(source, err);
      console.error(`[threat-intel] ${source} refresh failed: ${String(err?.message || err).slice(0, 200)}`);
    } finally {
      inFlight.delete(source);
    }
  })();
  inFlight.set(source, job);
  return job;
}

/** Fire-and-forget refresh of any source whose fetch window has elapsed. */
function ensureFresh() {
  const now = new Date();
  for (const source of Object.keys(SOURCES)) {
    getState(source)
      .then((state) => {
        if (!state?.nextFetchAt || state.nextFetchAt <= now) refreshSource(source);
      })
      .catch(() => refreshSource(source));
  }
}

/** Optional maintenance timer (used only if startAutoRefresh is called). */
let refreshTimer = null;
function startAutoRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(ensureFresh, 10 * 60 * 1000); // check every 10 min, server-side
  refreshTimer.unref?.();
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function initThreatIntel() {
  // First boot: populate the cache once so the dashboard is never empty;
  // afterwards the lazy scheduler (ensureFresh) keeps it current.
  const counts = await Promise.all(
    Object.keys(SOURCES).map(async (source) => (await getState(source))?.itemCount || 0)
  );
  if (counts.every((c) => c === 0)) {
    console.log('[threat-intel] empty cache - fetching initial data from official feeds...');
    await Promise.all(Object.keys(SOURCES).map((s) => refreshSource(s)));
  }
  startAutoRefresh();
}

export function kickOffRefresh() {
  ensureFresh();
}

export function stopThreatIntel() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

/**
 * Dashboard query. All inputs are validated upstream in the route.
 * @returns summary { items, total, page, pageSize }
 */
export async function queryThreats({
  severity = null,
  source = null,
  search = null,
  exploited = null,
  ransomware = null,
  dateFrom = null,
  dateTo = null,
  sort = 'newest',
  page = 1,
  pageSize = 20,
}) {
  const filter = {};
  if (severity) filter.severity = severity;
  if (source) filter.source = source;
  if (exploited === true) filter.kev = true;
  if (ransomware === true) filter.ransomwareUse = true;
  if (dateFrom || dateTo) {
    filter.feedDate = {};
    if (dateFrom) filter.feedDate.$gte = dateFrom;
    if (dateTo) filter.feedDate.$lte = dateTo;
  }
  if (search) {
    // CVE ID exact-prefix match OR keyword search (escape regex specials).
    const isCve = /^CVE-\d{4}-\d{1,6}$/i.test(search.trim());
    if (isCve) {
      filter._id = { $regex: `^${search.trim().toUpperCase()}` };
    } else {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { description: { $regex: safe, $options: 'i' } },
        { vendor: { $regex: safe, $options: 'i' } },
        { product: { $regex: safe, $options: 'i' } },
      ];
    }
  }

  // 'severity' is an aggregation-level order (missing cvss must rank as 0)
  // and is handled separately below; the simple path only sorts newest/oldest.
  const sortSpec = sort === 'oldest' ? { feedDate: 1 } : { feedDate: -1 };

  // severity sort is an aggregation-level order, done separately below when
  // requested - plain sorts cannot condition on missing cvss fields.
  let items, total;
  if (sort === 'severity') {
    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          rankFromSeverity: {
            $switch: {
              branches: [
                { case: { $eq: ['$severity', 'critical'] }, then: 4 },
                { case: { $eq: ['$severity', 'high'] }, then: 3 },
                { case: { $eq: ['$severity', 'medium'] }, then: 2 },
                { case: { $eq: ['$severity', 'low'] }, then: 1 },
              ],
              default: 0,
            },
          },
          cvssRank: { $ifNull: ['$cvss', 0] },
        },
      },
      // Severity tier first, then the CVSS score itself, then recency.
      { $sort: { rankFromSeverity: -1, cvssRank: -1, feedDate: -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ];
    [items, total] = await Promise.all([
      ThreatItem.aggregate(pipeline).allowDiskUse(true),
      ThreatItem.countDocuments(filter),
    ]);
  } else {
    [items, total] = await Promise.all([
      ThreatItem.find(filter).sort(sortSpec).skip((page - 1) * pageSize).limit(pageSize).lean(),
      ThreatItem.countDocuments(filter),
    ]);
  }

  return { items, total, page, pageSize };
}

/** Aggregate sync health + freshness for the frontend indicator. */
export async function getStatus() {
  const states = await ThreatSyncState.find({}).lean();
  const bySource = {};
  for (const s of states) {
    bySource[s.source] = {
      label: SOURCES[s.source]?.label || s.source,
      lastSuccessAt: s.lastSuccessAt,
      lastFetchedAt: s.lastFetchedAt,
      sourceModifiedAt: s.sourceModifiedAt,
      itemCount: s.itemCount,
      lastError: s.lastError,
      lastErrorAt: s.lastErrorAt,
      nextFetchAt: s.nextFetchAt,
    };
  }
  const total = await ThreatItem.countDocuments({});
  const newest = await ThreatItem.findOne({}, { feedDate: 1 }).sort({ feedDate: -1 }).lean();
  return {
    sources: bySource,
    totalItems: total,
    lastUpdatedAt: newest?.feedDate || null,
    generatedAt: new Date().toISOString(),
  };
}
