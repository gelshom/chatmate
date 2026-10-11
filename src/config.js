import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load `.env` from the server folder root (two levels up from src/).
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const env = process.env;
const isProduction = env.NODE_ENV === 'production' || Boolean(env.NETLIFY);
const jwtAccessSecret = env.JWT_ACCESS_SECRET || (isProduction ? '' : 'dev-access-secret');
const jwtRefreshSecret = env.JWT_REFRESH_SECRET || (isProduction ? '' : 'dev-refresh-secret');
const corsOrigin = (env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:5173,http://localhost:5174'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction) {
  const missing = [];
  const isSafeSecret = (value) => value.length >= 32 && !/^(dev-|change-me|replace-|your-|example)/i.test(value);
  if (!isSafeSecret(jwtAccessSecret)) missing.push('JWT_ACCESS_SECRET (use a unique random value of at least 32 characters)');
  if (!isSafeSecret(jwtRefreshSecret)) missing.push('JWT_REFRESH_SECRET (use a different unique random value of at least 32 characters)');
  if (!env.PUBLIC_URL) missing.push('PUBLIC_URL');
  if (!corsOrigin.length) missing.push('CORS_ORIGIN');
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

export const config = {
  port: Number(env.PORT) || 4000,
  publicUrl: env.PUBLIC_URL || 'http://localhost:4000',
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessTtl: env.JWT_ACCESS_TTL || '15m',
  jwtRefreshTtl: env.JWT_REFRESH_TTL || '30d',
  corsOrigin,
  dbFile: env.DB_FILE || path.resolve(__dirname, '../data/app.json'),
  uploadDir: env.UPLOAD_DIR || path.resolve(__dirname, '../uploads'),
  storeType: env.STORE_TYPE === 'remote' ? 'remote' : 'local',
  uploadStore: env.UPLOAD_STORE === 's3' ? 's3' : 'local',
  smtp: {
    host: env.SMTP_HOST || null,
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER || null,
    pass: env.SMTP_PASS || null,
    from: env.MAIL_FROM || 'ChatMate <noreply@chatmate.local>',
  },
  otpIssuer: env.OTP_ISSUER || 'ChatMate',
  adminEmail: String(env.ADMIN_EMAIL || '').trim().toLowerCase(),
  // Google OAuth 2.0. The /auth/google flow keeps failing closed until real
  // credentials are set here and server-side token verification is wired up.
  googleClientId: env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_ID.trim() : '',
  googleClientSecret: env.GOOGLE_CLIENT_SECRET ? env.GOOGLE_CLIENT_SECRET.trim() : '',
  googleCallbackUrl: env.GOOGLE_CALLBACK_URL ? env.GOOGLE_CALLBACK_URL.trim() : '',
};

export const SERVER_ROOT = path.resolve(__dirname, '..');
