/**
 * CyberShield - Backend server
 *
 * Serves the existing static CyberShield site AND the Gemini AI proxy API.
 *
 *   Browser -> CyberShield backend (/api/ai/*) -> Gemini API -> back
 *
 * The GEMINI_API_KEY is read from .env only. No key ever reaches the browser.
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import aiRouter from './routes/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.disable('x-powered-by');

/* ------------------------------------------------------------------ */
/* AI API (rate limited)                                               */
/* ------------------------------------------------------------------ */

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40, // 40 AI requests per 15 min per IP - comfortable for a demo, safe for free tier
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'AI service is temporarily unavailable. Please try again in a minute.',
  },
});

app.use('/api/ai', aiLimiter, aiRouter);

// Friendly JSON for any other /api path
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'AI service is temporarily unavailable. Please try again.' });
});

/* ------------------------------------------------------------------ */
/* Static site (the existing CyberShield frontend, untouched layout)   */
/* ------------------------------------------------------------------ */

app.use(express.static(PROJECT_ROOT, { extensions: ['html'] }));

app.use((req, res) => {
  res
    .status(404)
    .send('<h1>404 - Page not found</h1><p><a href="/html/index.html">Back to CyberShield</a></p>');
});

// Final error handler - never leak stack traces to users
app.use((err, req, res, next) => {
  console.error('[server] error:', err?.message || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'AI service is temporarily unavailable. Please try again.' });
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

const server = app.listen(PORT, '127.0.0.1', () => {
  const keyReady = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_KEY_HERE';
  console.log('┌──────────────────────────────────────────────────────┐');
  console.log('│  🛡️  CyberShield AI backend                          │');
  console.log('├──────────────────────────────────────────────────────┤');
  console.log(`│  Site + API :  http://localhost:${PORT}                 │`);
  console.log(`│  Gemini key :  ${keyReady ? '✅ loaded from .env' : '⚠️  MISSING - set GEMINI_API_KEY in .env'}      │`);
  console.log('│  Endpoints  :  POST /api/ai/scam-analyze             │');
  console.log('│                POST /api/ai/tutor                    │');
  console.log('│                POST /api/ai/learning-path            │');
  console.log('│                POST /api/ai/news-explain             │');
  console.log('└──────────────────────────────────────────────────────┘');
  if (!keyReady) {
    console.log('\n  ⚠️  AI features will return a friendly offline message until you');
    console.log('     add your free key to .env  (https://aistudio.google.com/apikey)\n');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n✖ Port ${PORT} is already in use. Stop the other server first ` +
        `(run stop-server.bat if the old Python server is running), or set PORT=3001 in .env.\n`
    );
    process.exit(1);
  }
  throw err;
});

/* Graceful shutdown */
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[server] ${signal} received - shutting down.`);
    server.close(() => process.exit(0));
  });
}
