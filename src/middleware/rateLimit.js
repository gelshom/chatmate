import rateLimit from 'express-rate-limit';
import { ApiError } from './error.js';

export function fail(status, message) {
  throw new ApiError(status, message);
}

const common = { standardHeaders: true, legacyHeaders: false };
export const apiLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 600 });
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 30 });
