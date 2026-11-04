/**
 * CyberShield - Session configuration (MongoDB-backed store)
 *
 * Secret resolution (in order):
 *   1. SESSION_SECRET env var - required in production, recommended always.
 *   2. Local-dev fallback: a random secret persisted to
 *      server/config/.session-secret (gitignored) so restarts do not
 *      invalidate local sessions. Never used when NODE_ENV=production:
 *      production fails fast instead, demanding an explicit secret.
 *
 * The .env file is never touched by this code.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(__dirname, '.session-secret');

function devFallbackSecret() {
  // Persist a random dev secret so sessions survive restarts.
  try {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* file does not exist yet */
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, `${generated}\n`, { mode: 0o600 });
  console.log('[auth] Generated a local development session secret (server/config/.session-secret, gitignored).');
  console.log('       Set SESSION_SECRET in your host\'s secret settings before deploying.');
  return generated;
}

export function resolveSessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) {
    if (secret.length < 32) {
      throw new Error('SESSION_SECRET is set but too short - use at least 32 random characters (e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`).');
    }
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is required in production. Add it through your hosting provider\'s secret settings (do not put it in .env).'
    );
  }
  return devFallbackSecret();
}

export const SESSION_COOKIE_NAME = /^[\w-]{1,64}$/.test(process.env.SESSIONNAME?.trim() || '')
  ? process.env.SESSIONNAME.trim()
  : 'cybershield.sid';
