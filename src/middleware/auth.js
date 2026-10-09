import { getData } from '../services/store.js';
import { verifyAccessToken } from '../services/token.service.js';
import { ApiError } from './error.js';

/**
 * Protects a route. Reads the `Authorization: Bearer <token>` header,
 * verifies the JWT and attaches the current user.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required.'));

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token.'));
  }

  const data = getData();
  const user = data.users.find((u) => u.uid === payload.sub);
  if (!user) return next(new ApiError(401, 'Account no longer exists.'));
  if (user.suspended) return next(new ApiError(403, 'This account has been suspended.'));

  req.user = user;
  req.userId = user.uid;
  next();
}

/** Optional auth: sets req.user only when a valid token is present. */
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const data = getData();
    const user = data.users.find((u) => u.uid === payload.sub);
    if (user) req.user = user;
  } catch {
    // ignore — treat as anonymous
  }
  next();
}
