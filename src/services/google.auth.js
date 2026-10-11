import https from 'node:https';
import crypto from 'node:crypto';
import { config } from '../config.js';

const GOOGLE_ISSUER = 'accounts.google.com';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// In-memory JWKS cache so we do not hit Google on every token verification.
const jwksCache = { cert: null, expiresAt: 0 };

function base64UrlDecode(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

/** Parse a JWT into { header, payload }. */
function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token format.');
  return {
    header: JSON.parse(base64UrlDecode(parts[0])),
    payload: JSON.parse(base64UrlDecode(parts[1])),
  };
}

/** Fetch the Google public cert for a given `kid`. */
function certificateForKid(kid) {
  if (Date.now() > jwksCache.expiresAt) jwksCache.cert = null;
  if (jwksCache.cert && jwksCache.cert.kid === kid) return Promise.resolve(jwksCache.cert);

  return new Promise((resolve, reject) => {
    https.get(
      GOOGLE_CERTS_URL,
      { headers: { 'User-Agent': 'chatmate-server' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const jwks = JSON.parse(data);
            const cert = jwks.keys?.find((k) => k.kid === kid);
            if (!cert) return reject(new Error('No Google cert found for token `kid`.'));
            jwksCache.cert = cert;
            jwksCache.expiresAt = Date.now() + 10 * 60 * 1000;
            resolve(cert);
          } catch (err) {
            reject(err);
          }
        });
      }
    ).on('error', reject);
  });
}

/** Convert a Google x5c certificate into a Node public key. */
function publicKeyFromCert(cert) {
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.x5c[0]}\n-----END CERTIFICATE-----`;
  return crypto.createPublicKey({ key: pem, format: 'pem' });
}

/**
 * Verify a Google ID token provided by the client and return the decoded
 * payload. Fails closed when Google credentials are not configured.
 */
export async function verifyGoogleIdToken(idToken) {
  const { googleClientId } = config;
  if (!googleClientId) throw new Error('Google OAuth is not configured (set GOOGLE_CLIENT_ID).');
  if (!idToken) throw new Error('No Google ID token was provided.');

  const { header, payload } = parseJwt(idToken);
  if (header.alg !== 'RS256') throw new Error(`Unsupported Google JWT algorithm: ${header.alg}.`);
  if (payload.iss !== GOOGLE_ISSUER) throw new Error('Invalid Google token issuer.');
  if (payload.aud !== googleClientId) throw new Error('Invalid Google token audience.');

  const cert = await certificateForKid(header.kid);
  const key = publicKeyFromCert(cert);
  const parts = idToken.split('.');
  const sig = Buffer.from(parts[2], 'base64');

  const verifier = crypto.createVerify('SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  if (!verifier.verify(key, sig)) throw new Error('Invalid Google ID token signature.');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Google ID token has expired.');
  if (payload.nbf && payload.nbf > now) throw new Error('Google ID token is not yet valid.');

  return payload;
}

/** Convenience: is Google authentication configured at all? */
export function googleConfigured() {
  return Boolean(config.googleClientId);
}
