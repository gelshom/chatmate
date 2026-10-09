import { ApiError } from './error.js';
import { isAdminUser } from '../utils/admin.js';

export function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) return next(new ApiError(403, 'Administrator access required.'));
  next();
}
