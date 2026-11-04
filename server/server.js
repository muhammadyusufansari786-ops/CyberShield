/**
 * CyberShield - Backend server
 *
 * Serves the existing static CyberShield site AND the Gemini AI proxy API.
 *
 *   Browser -> CyberShield backend (/api/ai/*) -> Gemini API -> back
 *
 * The GEMINI_API_KEY is read from .env only. No key ever reaches the browser.
 *
 * Day-1 upgrade additions:
 *   - MongoDB Atlas connection (server/config/database.js) - the app accepts
 *     traffic only after the database is ready, because authentication and
 *     sessions require it.
 *   - Express sessions stored in MongoDB (connect-mongo) mounted on /api.
 *   - Auth (/api/auth/*) and protected dashboard (/api/dashboard) routes,
 *     registered before the /api catch-all and static serving.
 *   - HOST / PORT come from the environment: HOST falls back to 127.0.0.1 so
 *     local development keeps working exactly as before.
 */

import 'dotenv/config';
import path from 'node:path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import aiRouter from './routes/ai.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import { connectDatabase, watchDatabase, closeDatabase } from './config/database.js';
import { resolveSessionSecret, SESSION_COOKIE_NAME } from './config/session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST?.trim() || '127.0.0.1'; // localhost by default
const IS_PROD = process.env.NODE_ENV === 'production';

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

/* ------------------------------------------------------------------ */
/* Login/registration rate limits are defined in routes/auth.js        */
/* ------------------------------------------------------------------ */

async function main() {
  /* ---------------------------------------------------------------- */
  /* 1. Database FIRST - no traffic before MongoDB is ready,          */
  /*    because sessions and authentication require it.               */
  /*                                                                  */
  /* DEV_NO_DB=1 (opt-in, local development only): start WITHOUT a    */
  /* database so the site can still be viewed. Auth/dashboard return  */
  /* a clear 503 until the real connection works. The default (and    */
  /* production) behavior stays fail-fast.                            */
  /* ---------------------------------------------------------------- */
  const DEV_NO_DB = process.env.DEV_NO_DB === '1';
  let dbReady = true;

  try {
    watchDatabase();
    await connectDatabase();
  } catch (err) {
    console.error('\n' + (err?.message || err));
    if (err?.code === 'CONFIG_MISSING') {
      console.error('       (No file was changed by CyberShield - add the variable yourself.)');
    }
    if (err?.cause?.message) {
      // Underlying driver detail, still credential-free for connection errors.
      console.error('       Underlying error:', err.cause.message.split(/\r?\n/)[0]);
    }
    if (DEV_NO_DB) {
      dbReady = false;
      console.error('\n  ⚠️  DEV_NO_DB=1 - starting WITHOUT the database.');
      console.error('      The site is viewable, but /api/auth/* and /api/dashboard return 503.');
      console.error('      Fix Atlas Network Access (IP whitelist) and restart without this flag.\n');
    } else {
      console.error('');
      process.exit(1);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 2. Sessions stored in MongoDB (no in-memory store).              */
  /* ---------------------------------------------------------------- */
  app.use(
    '/api',
    session({
      name: SESSION_COOKIE_NAME,
      secret: resolveSessionSecret(),
      resave: false,
      saveUninitialized: false, // no cookie for anonymous visitors
      rolling: true, // extend the session while the user stays active
      cookie: {
        httpOnly: true, // never readable from JS
        sameSite: 'lax',
        secure: IS_PROD, // secure cookies in production
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days of inactivity
      },
      // In DEV_NO_DB mode there is no connection to reuse, so sessions fall
      // back to the default in-memory store (development only - it is not
      // suitable for production, which is why the default path requires the DB).
      ...(dbReady
        ? {
            store: new MongoStore({
              client: mongoose.connection.getClient(), // reuses the single shared connection
              collectionName: 'sessions',
              ttl: 7 * 24 * 60 * 60, // automatically expire stale sessions server-side
              touchAfter: 24 * 3600, // avoid rewriting idle sessions on every request
            }),
          }
        : {}),
    })
  );

  /* ---------------------------------------------------------------- */
  /* 3. Routes (AI unchanged; auth + dashboard added before the       */
  /*    /api catch-all and static serving).                           */
  /* ---------------------------------------------------------------- */

  // Auth/dashboard need the database; a clear 503 instead of a crash in DEV_NO_DB mode.
  const requireDb = (req, res, next) =>
    dbReady
      ? next()
      : res
          .status(503)
          .json({ error: 'Database is not connected. Authentication is unavailable (DEV_NO_DB mode).' });

  app.use('/api/ai', aiLimiter, aiRouter);
  app.use('/api/auth', requireDb, authRouter);
  app.use('/api', requireDb, dashboardRouter);

  // Friendly JSON for any other /api path
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'AI service is temporarily unavailable. Please try again.' });
  });

  /* ---------------------------------------------------------------- */
  /* Static site (the existing CyberShield frontend, untouched layout) */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Start (only reached once MongoDB is connected)                   */
  /* ---------------------------------------------------------------- */

  const server = app.listen(PORT, HOST, () => {
    const keyReady = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_KEY_HERE';
    console.log('┌──────────────────────────────────────────────────────┐');
    console.log('│  🛡️  CyberShield AI backend                          │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log(`│  Site + API :  http://localhost:${PORT}                 │`);
    console.log(
      dbReady
        ? `│  Database   :  ✅ MongoDB Atlas connected             │`
        : `│  Database   :  ⚠️  DEV_NO_DB - auth disabled          │`
    );
    console.log(`│  Gemini key :  ${keyReady ? '✅ loaded from .env' : '⚠️  MISSING - set GEMINI_API_KEY in .env'}      │`);
    console.log('│  Endpoints  :  POST /api/ai/scam-analyze             │');
    console.log('│                POST /api/ai/tutor                    │');
    console.log('│                POST /api/ai/learning-path            │');
    console.log('│                POST /api/ai/news-explain             │');
    console.log('│                POST /api/auth/register | login       │');
    console.log('│                GET  /api/auth/me | /api/dashboard    │');
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

  /* Graceful shutdown - closes HTTP then the MongoDB connection */
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log(`\n[server] ${signal} received - shutting down.`);
      server.close(async () => {
        await closeDatabase().catch(() => {});
        process.exit(0);
      });
    });
  }
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err?.message || err);
  process.exit(1);
});
