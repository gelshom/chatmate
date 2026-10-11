import { ApiError } from '../middleware/error.js';
import { verifyGoogleIdToken, googleConfigured } from '../services/google.auth.js';

/**
 * Google sign-in now accepts a Google ID token and validates it on the
 * server before trusting any identity data. The previous demo implementation
 * trusted caller-supplied account identity fields (email/ID), which allowed
 * account impersonation. Until real Google credentials are set and the
 * account/session flow is wired in, this endpoint fails closed with HTTP 501.
 */
export async function googleAuth(req, res, next) {
  if (!googleConfigured()) {
    return next(new ApiError(501, 'Google sign-in is unavailable until server-side Google ID token verification is configured.'));
  }

  const idToken = req.body?.idToken;
  if (!idToken) {
    return next(new ApiError(400, 'A `idToken` is required to sign in with Google.'));
  }

  try {
    const payload = await verifyGoogleIdToken(idToken);
    res.json({ ok: true, payload });
  } catch (err) {
    next(new ApiError(401, `Google sign-in failed: ${err.message}`));
  }
}
