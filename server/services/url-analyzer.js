/**
 * CyberShield - Structural URL analyzer (Day 2 scam analyzer upgrade)
 *
 * PURPOSE: detect structurally suspicious traits in a user-submitted URL
 * (typosquatting, deceptive subdomains, IP hosts, insecure scheme, ...) so
 * both the user and the Gemini prompt get grounded, machine-detected facts.
 *
 * ⛔ SECURITY / SSRF RULE: this module NEVER contacts the submitted URL.
 * There is no fetch/axios/http request anywhere in it - URLs are strictly
 * PARSED as strings. Submitted content is never downloaded, redirected, or
 * executed, so no attacker-chosen endpoint can ever be reached from here.
 *
 * ⚠️ HONESTY RULE: structural oddities are WARNING SIGNS, not verdicts.
 * A URL with none of them is NOT proven safe, and HTTPS alone never proves
 * anything. Callers must present findings as "worth double-checking",
 * never as "definitely malicious" or "definitely legitimate".
 *
 * No submitted URL (or message) is ever logged.
 */

import { URL } from 'node:url';

/* ------------------------------------------------------------------ */
/* Registrable-domain heuristic                                        */
/* ------------------------------------------------------------------ */

/** Common two-label public suffixes so the tiny heuristic stays decent. */
const TWO_LABEL_SUFFIXES = new Set([
  'co.in', 'org.in', 'net.in', 'ac.in', 'gov.in', 'edu.in', 'res.in',
  'co.uk', 'org.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'or.jp', 'ne.jp',
  'com.br', 'com.sg', 'com.my', 'co.kr', 'co.za', 'com.tr', 'com.ar',
]);

/**
 * Lightweight registrable-domain guess ("alerts.paypal.com" -> "paypal.com",
 * "example.co.in" -> "example.co.in") without packages or DNS lookups.
 */
function registrableDomain(host) {
  const labels = host.toLowerCase().split('.');
  const keep = TWO_LABEL_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

/* ------------------------------------------------------------------ */
/* Well-known brands for typosquatting / impersonation checks          */
/* ------------------------------------------------------------------ */

const BRANDS = [
  'paypal', 'sbi', 'hdfc', 'icici', 'axisbank', 'kotak', 'amazon', 'flipkart',
  'paytm', 'phonepe', 'netflix', 'facebook', 'instagram', 'whatsapp',
  'irctc', 'uidai', 'aadhaar', 'microsoft',
];

/** Brands' real registrable domains (for subdomain-impersonation checks). */
const BRAND_DOMAINS = {
  paypal: 'paypal.com', sbi: 'sbi.co.in', hdfc: 'hdfcbank.com', icici: 'icicibank.com',
  axisbank: 'axisbank.com', kotak: 'kotak.com', amazon: 'amazon.in', flipkart: 'flipkart.com',
  paytm: 'paytm.com', phonepe: 'phonepe.com', netflix: 'netflix.com',
  facebook: 'facebook.com', instagram: 'instagram.com', whatsapp: 'whatsapp.com',
  irctc: 'irctc.co.in', uidai: 'uidai.gov.in', microsoft: 'microsoft.com',
  aadhaar: 'uidai.gov.in',
};

/** URL shorteners: destination is hidden, so anyone can be a victim of one. */
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'is.gd', 'shorturl.at',
  'rb.gy', 'rebrand.ly', 'ow.ly', 'tiny.cc', 'buff.ly', 'shorte.st',
]);

/** Small Levenshtein distance (labels are short; O(n*m) is fine). */
function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Neutral detector: a brand token appears in the address but the registrable
 * domain is NOT the brand's real domain, OR the domain is a 1-2 character
 * near-miss of a brand name (paypa1.com). Returns {brand, kind} or null.
 */
function findBrandImpersonation(regDomain, host) {
  const rd = regDomain.toLowerCase();
  const secondLevel = rd.replace(/\.[a-z.]{2,7}$/, '');
  let nearMiss = null;

  for (const brand of BRANDS) {
    const realDomain = BRAND_DOMAINS[brand];

    if (realDomain && rd === realDomain) continue; // genuinely the brand

    // a) brand token visible in the host/subdomain of an unrelated domain
    if (realDomain && host.includes(brand) && rd !== realDomain && !host.endsWith('.' + realDomain)) {
      return { brand, kind: 'token-not-real-domain' };
    }

    // b) near-miss of the brand name itself (paypa1.com, hdfc-bank.info)
    // Short names need a tighter threshold: "bit" and "sbi" or "bob" are
    // 2 edits apart but completely unrelated services.
    const core = secondLevel.replace(/[^a-z0-9]/g, '');
    const maxDist = brand.length <= 4 ? 1 : 2;
    const dist = levenshtein(core, brand);
    if (dist > 0 && dist <= maxDist && core.length >= brand.length - 1) {
      nearMiss = { brand, kind: 'near-miss' };
    }
  }
  return nearMiss;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/**
 * Analyze a URL string structurally. Never touches the network.
 *
 * @param {string} raw  the URL text the user submitted
 * @returns {object}    { ok, host, schemeGiven, registrableDomain?,
 *                        warnings: [{headline, detail}], summary }
 *                      ok=false when the input cannot be treated as a URL.
 */
export function analyzeUrl(raw) {
  const input = String(raw || '')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, ''); // invisible joiner characters

  if (!input) return { ok: false, reason: 'empty' };

  // Dangerous pseudo-schemes: verdict is immediate and needs no parsing.
  if (/^(data|javascript|vbscript|file):/i.test(input)) {
    return {
      ok: true,
      host: null,
      schemeGiven: true,
      warnings: [
        {
          headline: 'Not a regular web address (data/JavaScript-style value)',
          detail:
            'This kind of value is always suspicious when it arrives in a message. Do not open or run it - browsers cannot safely interpret it here.',
        },
      ],
      summary:
        'User submitted a data:/javascript: style value instead of a normal web address - strongly advise not opening it.',
    };
  }

  // Normalize: prepend https:// for scheme-less input ("example.com/x").
  const schemeGiven = /^[a-z][a-z0-9+.-]*:/i.test(input) || /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  const candidate = schemeGiven ? input : `https://${input}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, reason: 'unsupported-scheme' };
  }

  const host = parsed.hostname.toLowerCase();
  const warnings = [];
  const push = (headline, detail) => warnings.push({ headline, detail });

  if (!host || host.startsWith('[')) {
    return { ok: false, reason: 'no-hostname' };
  }

  const rd = registrableDomain(host);

  /* ---- scheme-level checks ------------------------------------- */
  if (!schemeGiven) {
    push(
      'Security scheme not stated',
      'The address was given without "http://" or "https://", so transport security could not be judged. Actual safety depends on how the site really loads - this alone is NOT a scam verdict.',
    );
  } else if (parsed.protocol === 'http:') {
    push(
      'No encryption (plain HTTP)',
      'Data sent to this address would not be encrypted. HTTP alone does NOT make a link malicious - but never submit passwords, OTPs or payment details on a non-encrypted page.',
    );
  }

  /* ---- host-level checks --------------------------------------- */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    push(
      'IP-address host instead of a domain name',
      'Real services almost always live at a named domain. Links pointing straight at an IP address are common in phishing kits, though some legitimate self-hosted tools also use them.',
    );
  }
  if (host.includes('xn--')) {
    push(
      'Internationalized/punycode domain',
      'The domain uses non-ASCII characters encoded as "xn--..." which browsers render in their original script - a classic look-alike-letter trick. Read the address character by character.',
    );
  }
  const labelCount = host.split('.').length;
  if (labelCount >= 5) {
    push(
      'Very long chain of subdomains',
      `The host has ${labelCount} labels. Scammers often hide the real controlling domain at the end of a long subdomain chain - check the part just before the first "/".`,
    );
  }
  if (input.length > 200) {
    push(
      'Unusually long URL',
      'Very long addresses are frequently used to push the important part off the visible address bar or chat preview.',
    );
  }
  if (parsed.username || parsed.password) {
    push(
      'Login credentials embedded in the address',
      'The URL contains "user:password@" before the domain - an outdated trick to make a link LOOK like the site named after the credentials.',
    );
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    push(
      `Unusual port (${parsed.port})`,
      'Standard web servers use ports 80/443. Odd ports are sometimes benign test servers but uncommon in links sent by ordinary companies.',
    );
  }
  if (SHORTENERS.has(rd)) {
    push(
      'Shortened link',
      'The true destination is masked behind a URL shortener. Expand it (share-tools, preview services, or asking the sender) before judging where it really goes.',
    );
  }

  const impersonation = findBrandImpersonation(rd, host);
  if (impersonation?.kind === 'near-miss') {
    push(
      `Domain imitates "${impersonation.brand}"`,
      `The domain differs from the real "${BRAND_DOMAINS[impersonation.brand] || impersonation.brand}" brand address by only a character or two. Compare them carefully BEFORE entering any details.`,
    );
  } else if (impersonation?.kind === 'token-not-real-domain') {
    push(
      `Brand name used outside the company's own domain`,
      `The name "${impersonation.brand}" appears in the address, but the site is not on the company's official domain (${BRAND_DOMAINS[impersonation.brand] || impersonation.brand}). Anyone can register any domain; treat the real company domain as the only trusted one.`,
    );
  }

  /* ---- path / query checks ------------------------------------- */
  const pathLower = (parsed.pathname + parsed.search).toLowerCase();
  const PATH_HINTS = [
    {
      re: /(verify|verification-?(page|account)?|confirm-?account|secure-?(login|account|id))/,
      headline: '"verify / confirm / secure" wording in path',
      detail: 'Real banks rarely need account holders to "verify their account" from a link sent to them.',
    },
    {
      re: /(kyc|know-?your-?customer)/,
      headline: '"KYC update" wording in path',
      detail: 'KYC-expiry threats are a mass SMS scam staple in India; banks notify through the official app or branch, not by timed links.',
    },
    {
      re: /(otp|one-?time-?(password)?|upi|pin)/,
      headline: '"OTP / UPI / PIN" wording in path',
      detail: 'No legitimate URL ever needs your OTP, PIN or UPI credentials.',
    },
    {
      re: /(login|signin|account-?login)/,
      headline: '"login" path',
      detail: 'Reminder: when in doubt, open the company website yourself instead of trusting a login link you were sent.',
    },
  ];
  if (pathLower) {
    for (const hint of PATH_HINTS) {
      if (hint.re.test(pathLower)) {
        push(hint.headline, hint.detail);
        break; // one path hint is enough; avoid stacking near-duplicates
      }
    }
  }

  return {
    ok: true,
    host,
    schemeGiven,
    registrableDomain: rd,
    warnings,
    summary:
      (warnings.length
        ? `${warnings.length} structural warning sign${warnings.length > 1 ? 's' : ''}`
        : 'no structural warning signs') + ` (host: ${host.slice(0, 100)})`,
  };
}
