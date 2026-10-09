import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { getData, update } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { fail } from '../middleware/rateLimit.js';
import { config } from '../config.js';

const SALT_ROUNDS = 10;
function goodPassword(p) {
  return typeof p === 'string' && p.length >= 6;
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = getData().users.find((u) => u.uid === req.userId);
  if (!user) throw new ApiError(404, 'User not found.');
  if (user.password && !(await bcrypt.compare(currentPassword || '', user.password))) {
    throw new ApiError(401, 'Current password is incorrect.');
  }
  if (!goodPassword(newPassword)) throw new ApiError(400, 'New password must be at least 6 characters long.');
  update((d) => {
    d.users.find((x) => x.uid === req.userId).password = bcrypt.hashSync(newPassword, SALT_ROUNDS);
    return d;
  });
  res.json({ ok: true, message: 'Password changed.' });
}

export function enableTwoFactor(req, res) {
  const secret = speakeasy.generateSecret({ name: `${config.otpIssuer}: ${req.user.email || req.user.username}` });
  const user = getData().users.find((u) => u.uid === req.userId);
  if (user.twoFA?.enabled) throw new ApiError(400, 'Two-factor authentication is already enabled.');
  update((d) => {
    d.users.find((x) => x.uid === req.userId).twoFA = { secret: secret.base32, enabled: true };
    return d;
  });
  res.json({ ok: true, secret: secret.base32, otpauth_url: secret.otpauth_url, message: 'Scan the QR code, then confirm with a code.' });
}

export function confirmTwoFactor(req, res) {
  const { code } = req.body;
  if (!code) fail(400, 'code is required.');
  const user = getData().users.find((u) => u.uid === req.userId);
  if (!user?.twoFA?.secret) throw new ApiError(400, 'Start enabling 2FA first.');
  if (!speakeasy.totp.verify({ secret: user.twoFA.secret, encoding: 'base32', token: String(code) })) {
    throw new ApiError(401, 'Invalid authentication code.');
  }
  update((d) => {
    d.users.find((x) => x.uid === req.userId).twoFA.enabled = true;
    return d;
  });
  res.json({ ok: true, message: 'Two-factor authentication enabled.' });
}

export function disableTwoFactor(req, res) {
  const { code } = req.body;
  if (!code) fail(400, 'code is required.');
  const user = getData().users.find((u) => u.uid === req.userId);
  if (!user?.twoFA?.enabled) throw new ApiError(400, 'Two-factor authentication is not enabled.');
  if (!speakeasy.totp.verify({ secret: user.twoFA.secret, encoding: 'base32', token: String(code) })) {
    throw new ApiError(401, 'Invalid authentication code.');
  }
  update((d) => {
    d.users.find((x) => x.uid === req.userId).twoFA = null;
    return d;
  });
  res.json({ ok: true, message: 'Two-factor authentication disabled.' });
}