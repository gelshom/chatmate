import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { getData, update, genId, now } from '../services/store.js';
import { signAccessToken, signRefreshToken } from '../services/token.service.js';
import { ApiError } from '../middleware/error.js';
import { publicUser } from '../utils/public.js';

const SALT_ROUNDS = 10;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function goodPassword(p) {
  return typeof p === 'string' && p.length >= 6;
}

/** Persist a refresh token + device entry for a login session. */
function storeSession(userId, token, request) {
  return update((d) => {
    const deviceName = request?.headers?.['user-agent'] || 'Unknown device';
    d.devices.push({
      id: genId('dev'),
      userId,
      name: String(deviceName).slice(0, 120),
      ip: request?.ip || null,
      createdAt: now(),
      lastActive: now(),
    });
    const deviceId = d.devices[d.devices.length - 1].id;
    d.refreshTokens.push({
      id: genId('rt'),
      userId,
      token,
      deviceId,
      createdAt: now(),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
      revoked: false,
    });
    return d;
  });
}

function issueTokens(user) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user, null) };
}

function defaultSettings() {
  return { notifyMessages: true, notifyFriends: true, notifyGroups: true, readReceipts: true, darkMode: 'system' };
}

function findUserByIdentifier(data, identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return null;
  return (
    data.users.find((u) => u.email?.toLowerCase() === key) ||
    data.users.find((u) => u.phone === key) ||
    data.users.find((u) => u.username?.toLowerCase() === key)
  );
}

export async function register(req, res) {
  const { email, password, username, displayName, phone } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw new ApiError(400, 'A valid email is required.');
  if (getData().users.some((u) => u.email?.toLowerCase() === cleanEmail)) {
    throw new ApiError(409, 'An account with this email already exists.');
  }
  const cleanUsername = String(username || displayName || 'user').trim().toLowerCase().replace(/\s+/g, '') || 'user';
  if (getData().users.some((u) => u.username?.toLowerCase() === cleanUsername)) {
    throw new ApiError(409, 'This username is already taken.');
  }
  if (!goodPassword(password)) throw new ApiError(400, 'Password must be at least 6 characters long.');

  const user = {
    uid: genId('u'),
    username: cleanUsername,
    displayName: String(displayName || username || cleanUsername),
    email: cleanEmail,
    phone: phone || null,
    password: await bcrypt.hash(password, SALT_ROUNDS),
    photoURL: '',
    bio: '',
    isOnline: false,
    lastSeen: now(),
    createdAt: now(),
    emailVerified: false,
    role: 'user',
  };
  update((d) => {
    d.users.push(user);
    d.settings[user.uid] = defaultSettings();
    return d;
  });

  const { accessToken, refreshToken } = issueTokens(user);
  await storeSession(user.uid, refreshToken, req);

  res.status(201).json({ ok: true, message: 'Account created.', user: publicUser(user, getData(), user.uid), accessToken, refreshToken });
}

export async function login(req, res) {
  const { identifier, password } = req.body;
  const data = getData();
  const user = findUserByIdentifier(data, identifier);
  if (!user || !user.password) throw new ApiError(401, 'Invalid credentials.');
  if (!(await bcrypt.compare(password, user.password))) throw new ApiError(401, 'Invalid credentials.');
  if (user.suspended) throw new ApiError(403, 'This account has been suspended.');

  if (user.twoFA?.enabled) return res.json({ ok: true, require2FA: true, userId: user.uid });

  const { accessToken, refreshToken } = issueTokens(user);
  await storeSession(user.uid, refreshToken, req);
  res.json({ ok: true, user: publicUser(user, data, user.uid), accessToken, refreshToken, message: 'Signed in.' });
}

export async function verifyTwoFactor(req, res) {
  const { userId, code } = req.body;
  const user = getData().users.find((u) => u.uid === userId);
  if (!user?.twoFA?.enabled) throw new ApiError(400, 'Two-factor authentication is not enabled.');
  if (!speakeasy.totp.verify({ secret: user.twoFA.secret, encoding: 'base32', token: String(code) })) {
    throw new ApiError(401, 'Invalid authentication code.');
  }
  const data = getData();
  const { accessToken, refreshToken } = issueTokens(user);
  await storeSession(user.uid, refreshToken, req);
  res.json({ ok: true, user: publicUser(user, data, user.uid), accessToken, refreshToken });
}

export async function verifyEmail(req, res) {
  const { code } = req.query;
  if (!code) throw new ApiError(400, 'Missing verification code.');
  let decoded;
  try {
    decoded = Buffer.from(code, 'base64url').toString('utf8');
  } catch {
    throw new ApiError(400, 'Invalid verification code.');
  }
  const [uid] = decoded.split('.');
  let wasVerified = false;
  update((d) => {
    const u = d.users.find((x) => x.uid === uid);
    if (u && !u.emailVerified) {
      u.emailVerified = true;
      wasVerified = true;
    }
    return d;
  });
  res.json({ ok: true, message: wasVerified ? 'Email verified.' : 'Email was already verified.' });
}
