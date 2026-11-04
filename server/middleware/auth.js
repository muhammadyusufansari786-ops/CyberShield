/**
 * CyberShield - authentication middleware
 *
 * requireAuth       - 401 unless a valid logged-in session exists.
 * sameOriginGuard   - CSRF defense for state-changing requests: rejects
 *                     cross-origin form POSTs when a Origin/Referer from a
 *                     foreign site is present. Combined with SameSite=Lax
 *                     httpOnly cookies this covers state-changing auth routes.
 */

export function requireAuth(req, res, next) {
  if (req.session?.user?.id) return next();
  return res.status(401).json({ error: 'Please sign in to continue.' });
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function sameOriginGuard(req, res, next) {
  if (!STATE_CHANGING.has(req.method)) return next();

  const origin = req.get('origin');
  const referer = req.get('referer');

  if (!origin && !referer) return next(); // no cross-site request evidence (same-origin tools)

  const header = new URL(origin || referer, 'http://placeholder.local');
  const allowed = new URL(`http://${req.get('host') || 'placeholder.local'}`);
  if (header.host === allowed.host) return next();

  return res.status(403).json({ error: 'Blocked cross-site request.' });
}
