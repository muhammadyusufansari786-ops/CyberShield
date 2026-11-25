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

/**
 * Server-side administrator gate.
 *
 * The role is read from the DATABASE on every request (never trusted from the
 * session payload or from anything the browser sends), so demoting an account
 * takes effect immediately. A 403 is returned for signed-in non-admins and a
 * 401 for anonymous callers - admin UI buttons are irrelevant to this check.
 */
export async function requireAdmin(req, res, next) {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: 'Please sign in to continue.' });
    }
    const { User } = await import('../models/index.js');
    const user = await User.findById(req.session.user.id).select({ role: 1, email: 1 }).lean();
    if (!user) {
      return req.session.destroy(() => res.status(401).json({ error: 'Please sign in to continue.' }));
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    req.admin = { id: String(user._id), email: user.email };
    return next();
  } catch (err) {
    return next(err);
  }
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
