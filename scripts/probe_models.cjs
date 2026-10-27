#!/usr/bin/env node
/* One-off diagnostic probe (safe: never prints the key) */
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const keyMatch = env.match(/^GEMINI_API_KEY=(.+)$/m);
if (!keyMatch) { console.error('no key found in .env'); process.exit(1); }
const key = keyMatch[1].trim();
const MODEL_ENV = (env.match(/^GEMINI_MODEL=(.+)$/m) || [null, 'unset'])[1];

const MODELS = [MODEL_ENV, 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

(async () => {
  for (const model of [...new Set(MODELS)].filter(Boolean)) {
    const started = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }] }),
        signal: AbortSignal.timeout(25000),
      });
      const ms = Date.now() - started;
      const body = await res.json().catch(() => ({}));
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(body?.error?.status || body?.error?.message || '').slice(0, 80);
      console.log(`${model.padEnd(26)} HTTP ${res.status} in ${String(ms).padStart(6)}ms -> ${String(text).replace(/\s+/g, ' ').slice(0, 60)}`);
    } catch (err) {
      const ms = Date.now() - started;
      console.log(`${model.padEnd(26)} FAILED in ${String(ms).padStart(6)}ms -> ${err.name || 'error'}: ${err.message}`);
    }
  }
})();
