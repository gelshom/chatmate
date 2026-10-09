import { ApiError } from '../middleware/error.js';

/**
 * Google sign-in must validate a Google ID token on the server before it can
 * create a ChatMate session. The previous demo implementation trusted a
 * caller-supplied Google ID and email, which allowed account impersonation.
 * Keep the route explicit, but fail closed until proper token verification is
 * configured.
 */
export async function googleAuth() {
  throw new ApiError(501, 'Google sign-in is unavailable until server-side Google ID token verification is configured.');
}
