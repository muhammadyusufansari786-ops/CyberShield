/**
 * CyberShield - Gemini diagnostic (read-only)
 *
 * Verifies the configured GEMINI_MODEL / GEMINI_FALLBACK_MODEL against
 * Google's live model list, then makes one real generateContent request
 * per configured model and reports status/latency.
 *
 * Prints NO secret values: names, statuses and timings only.
 * Run with your .env audience:   node scripts/gemini-diagnose.mjs
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const GEMINI_HOST = 'https://generativelanguage.googleapis.com';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const label = (ms) => (ms >= 0 ? `${ms}ms` : 'n/a');

function showModels(models) {
  const generated = models.filter((m) => /generateContent/.test(Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.join() || ''));
  console.log(`Model-list: ${models.length} models total, ${generated.length} support generateContent`);
  for (const m of generated) {
    console.log(`  - ${m.name}${m.displayName ? `  (${m.displayName})` : ''}`);
  }
  return new Set(generated.map((m) => m.name.replace(/^models\//, '')));
}

async function main() {
  console.log(`env models: primary=${MODEL} fallback=${FALLBACK_MODEL}  (values are names, not secrets)`);
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_KEY_HERE') {
    console.error('GEMINI_API_KEY not available in this environment.');
    process.exit(1);
  }

  // 1. Live model list - authoritative check that the ids are valid.
  let valid;
  try {
    const res = await fetch(`${GEMINI_HOST}/v1beta/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
    });
    console.log(`model list HTTP status: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const t = await res.text();
      console.log(`(error body: ${t.slice(0, 200)})`);
      process.exit(2);
    }
    const data = await res.json();
    valid = showModels(data.models || []);
    for (const id of [MODEL, FALLBACK_MODEL]) {
      console.log(`  ${valid.has(id) ? 'VALID' : 'NOT FOUND'}  -> ${id}`);
    }
  } catch (err) {
    console.error(`model list fetch failed: ${String(err?.message || err).slice(0, 200)}`);
    process.exit(3);
  }

  // 2. Real request through each configured model.
  const t = { primary: -1, fallback: -1 };
  for (const [key, model] of [['primary', MODEL], ['fallback', FALLBACK_MODEL]]) {
    const started = Date.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: diagnostic ok' }] }],
        config: { temperature: 0, maxOutputTokens: 2000 },
      });
      t[key] = Date.now() - started;
      const txt =
        typeof res?.text === 'function' ? res.text() : res?.text;
      console.log(`REAL REQUEST ${key} (${model}): SUCCESS in ${label(t[key])} -> ${String(txt).slice(0, 80)}`);
    } catch (err) {
      t[key] = Date.now() - started;
      const status = err?.status ?? err?.code ?? 'none';
      console.log(`REAL REQUEST ${key} (${model}): FAILED after ${label(t[key])} status=${status}`);
      console.log(`   detail: ${String(err?.message || err).slice(0, 180)}`);
    }
  }
  console.log(`summary: primary=${label(t.primary)} fallback=${label(t.fallback)}`);
}

main();
