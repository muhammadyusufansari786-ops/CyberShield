/**
 * CyberShield - threat intelligence API routes (Day 2)
 *
 * GET /api/threats        - cached, filtered, paginated vulnerability list
 *                           (CISA KEV + NIST NVD, refreshed lazily)
 * GET /api/threats/status - per-source sync health + "last updated" data
 *
 * Not writable: threat data is a read-only projection of the official feeds.
 * No API keys are ever exposed (NVD key is server-env only and optional).
 * No submitted user data is involved - nothing about the visitor is stored
 * or logged here.
 */

import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  queryThreats,
  getStatus,
  kickOffRefresh,
} from '../services/threat-intel.js';

const router = Router();

/** Light per-IP limit: the page fires a handful of filtered queries, not a firehose. */
const threatsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const SOURCES_ALLOWED = new Set(['cisa-kev', 'nvd']);
const SORTS_ALLOWED = new Set(['newest', 'oldest', 'severity']);

function safeQueryList(value, allowed) {
  if (typeof value !== 'string' || !value.trim()) return null;
  // Support a single value per query param (UI sends one filter at a time).
  const v = value.trim().toLowerCase();
  return allowed.has(v) ? v : null;
}

function safeDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) || Math.abs(d.getTime()) > Date.now() + 24 * 60 * 60 * 1000
    ? null
    : d;
}

function safeSearch(value) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/[\u0000-\u001F]/g, '').trim();
  if (!s || s.length > 120) return null;
  return s;
}

/* ------------------------------------------------------------------ */
/* GET /api/threats                                                    */
/* ------------------------------------------------------------------ */

router.get('/', async (req, res) => {
  try {
    // May trigger a lazy background refresh of an elapsing feed - never awaited.
    kickOffRefresh();

    const page = Math.max(1, Math.min(Number(req.query.page) || 1, 500));
    const pageSize = Math.max(5, Math.min(Number(req.query.pageSize) || 20, 50));

    const result = await queryThreats({
      severity: safeQueryList(req.query.severity, SEVERITIES),
      source: safeQueryList(req.query.source, SOURCES_ALLOWED),
      search: safeSearch(req.query.search),
      exploited: req.query.exploited === '1' || req.query.exploited === 'true',
      ransomware: req.query.ransomware === '1' || req.query.ransomware === 'true',
      dateFrom: safeDate(req.query.dateFrom),
      dateTo: safeDate(req.query.dateTo),
      sort: SORTS_ALLOWED.has(String(req.query.sort || '')) ? req.query.sort : 'newest',
      page,
      pageSize,
    });

    // Display string for severity - the field maps 1:1 from CVSS, or is null.
    res.json({
      ...result,
      items: result.items.map((item) => ({
        cveId: item._id,
        source: item.source,
        sourceName: item.source === 'cisa-kev' ? 'CISA KEV' : 'NIST NVD',
        title: item.title,
        description: item.description,
        severity: item.severity, // critical|high|medium|low|null (KEV-only = null)
        cvss: typeof item.cvss === 'number' ? item.cvss : null,
        cvssVersion: item.cvssVersion,
        published: item.published,
        lastModified: item.lastModified,
        feedDate: item.feedDate, // CISA dateAdded or NVD published
        vendor: item.vendor,
        product: item.product,
        kev: item.kev,
        kevDateAdded: item.kevDateAdded,
        kevDueDate: item.kevDueDate,
        ransomwareUse: item.ransomwareUse,
        requiredAction: item.requiredAction,
        cwes: item.cwes || [],
        url: item.url,
      })),
    });
  } catch (err) {
    console.error('[threats-route] query error:', err?.message || err);
    res.status(500).json({ error: 'Threat intelligence data is temporarily unavailable. Please try again.' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/threats/status                                             */
/* ------------------------------------------------------------------ */

router.get('/status', async (req, res) => {
  try {
    kickOffRefresh();
    res.json(await getStatus());
  } catch (err) {
    console.error('[threats-route] status error:', err?.message || err);
    res.status(500).json({ error: 'Threat intelligence status is temporarily unavailable.' });
  }
});

export { threatsLimiter };
export default router;
