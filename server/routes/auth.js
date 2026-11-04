/**
 * CyberShield - authentication routes
 *
 * POST /api/auth/register  { name, email, password }
 * POST /api/auth/login     { email, password }
 * POST /api/auth/logout
 * GET  /api/auth/me
 *
 * All state-changing routes sit behind the same-origin CSRF guard.
 * Login/register each have their own rate limiter (stricter than the AI one).
 * Responses never include password hashes; req.body is never assigned into
 * the model wholesale (admin/role cannot be created through the public API).
 */

import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { sameOriginGuard } from '../middleware/auth.js';
import { SESSION_COOKIE_NAME } from '../config/session.js';

const router = Router();

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10, // 10 login attempts / 15 min / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10, // 10 registrations / hour / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

/* ------------------------------------------------------------------ */
/* Validation helpers (same style as routes/ai.js)                     */
/* ------------------------------------------------------------------ */

function str(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Minimum 8 chars, at least one letter and one digit.
const PASSWORD_RE = /^(?=.*\p{L})(?=.*\d).{8,128}$/u;

/* ------------------------------------------------------------------ */
/* 1. Register                                                         */
/* ------------------------------------------------------------------ */

router.post(
  '/register',
  sameOriginGuard,
  express.json({ limit: '16kb' }), // same per-route pattern as routes/ai.js
  registerLimiter,
  async (req, res, next) => {
  try {
    const name = str(req.body?.name, 80);
    const emailRaw = str(req.body?.email, 254);
    const password = req.body?.password;

    const problems = [];
    if (!name || name.length < 2) problems.push('Enter your full name (at least 2 characters).');
    if (!emailRaw || !EMAIL_RE.test(emailRaw)) problems.push('Enter a valid email address.');
    if (typeof password !== 'string' || !PASSWORD_RE.test(password)) {
      problems.push('Password must be at least 8 characters and include letters and digits.');
    }
    if (problems.length) return res.status(400).json({ error: problems.join(' ') });

    const email = emailRaw.toLowerCase();

    const existing = await User.exists({ email });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Explicit field list => mass-assignment safe: no `role`/`admin` ever
    // arrives here from the request, and defaults are not overridable.
    const user = await User.create({ name, email, passwordHash });

    // Log the session in right away (session.id from the fresh, unauthorized
    // session must be regenerated to avoid fixation).
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: user._id.toString(), name: user.name, email: user.email };
      res.status(201).json({ user: user.toSafeJSON() });
    });
  } catch (err) {
    // Unique-index race on concurrent registrations
    if (err?.code === 11000 || /duplicate key/i.test(err?.message || '')) {
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
    }
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* 2. Login                                                            */
/* ------------------------------------------------------------------ */

router.post('/login', sameOriginGuard, express.json({ limit: '16kb' }), loginLimiter, async (
  req,
  res,
  next
) => {
  try {
    const emailRaw = str(req.body?.email, 254);
    const password = req.body?.password;

    if (!emailRaw || !EMAIL_RE.test(emailRaw) || typeof password !== 'string' || password.length > 1024) {
      // Same generic wording as wrong credentials => no account enumeration.
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = await User.findOne({ email: emailRaw.toLowerCase() });

    const ok = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEeO8HSqPzjeCmKzEuqO8u5rXf6F3fY0eX6'); // dummy hash: even unknown emails cost the same timing

    if (!user || !ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Session fixation defense: new session ID on privilege change.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: user._id.toString(), name: user.name, email: user.email };
      User.updateOne({ _id: user._id }, { lastLogin: new Date() }).catch(() => {});
      res.json({ user: user.toSafeJSON() });
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* 3. Logout                                                           */
/* ------------------------------------------------------------------ */

router.post('/logout', sameOriginGuard, (req, res, next) => {
  if (!req.session) return res.json({ ok: true });

  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* 4. Who am I                                                         */
/* ------------------------------------------------------------------ */

router.get('/me', async (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const user = await User.findById(req.session.user.id);
  if (!user) {
    // Account deleted while a stale session cookie still exists.
    return req.session.destroy(() => res.status(401).json({ error: 'Not signed in.' }));
  }

  res.json({ user: user.toSafeJSON() });
});

/* ------------------------------------------------------------------ */
/* 5. JSON-body errors                                                 */
/* ------------------------------------------------------------------ */

// A malformed body would otherwise bubble to the global error handler and
// surface as a 500. Keep login answers uniform (and non-enumerating).
router.use((err, req, res, next) => {
  if (req.method === 'POST' && (req.path === '/login' || req.path === '/register')) {
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
  }
  next(err);
});

export default router;
