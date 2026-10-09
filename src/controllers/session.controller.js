import { getData, update, now } from '../services/store.js';
import { signAccessToken, verifyRefreshToken } from '../services/token.service.js';
import { ApiError } from '../middleware/error.js';
import { publicUser } from '../utils/public.js';
import { emitPresenceToContacts, emitToUser, hasActiveUserConnection } from '../services/realtime.js';
import { fail } from '../middleware/rateLimit.js';

export async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(400, 'refreshToken is required.');

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token.');
  }

  const data = getData();
  const stored = data.refreshTokens.find((t) => t.token === refreshToken && t.revoked === false);
  if (!stored || stored.userId !== payload.sub) throw new ApiError(401, 'Refresh token has been revoked.');
  const user = data.users.find((u) => u.uid === payload.sub);
  if (!user) throw new ApiError(401, 'Account no longer exists.');
  if (user.suspended) throw new ApiError(403, 'This account has been suspended.');

  res.json({ ok: true, accessToken: signAccessToken(user), refreshToken });
}

export async function me(req, res) {
  const data = getData();
  const user = data.users.find((u) => u.uid === req.userId);
  if (!user) throw new ApiError(404, 'User not found.');
  const devices = data.devices.filter((dev) => dev.userId === req.userId);
  res.json({ ok: true, user: publicUser(user, data, req.userId), devices });
}

export function logout(req, res) {
  const { refreshToken } = req.body;
  const shouldMarkOffline = !hasActiveUserConnection(req.userId);
  const lastSeen = now();
  update((d) => {
    d.refreshTokens = d.refreshTokens.map((t) => (t.token === refreshToken ? { ...t, revoked: true } : t));
    d.devices = d.devices.filter((dev) => dev.userId !== req.userId);
    const u = d.users.find((x) => x.uid === req.userId);
    if (u && shouldMarkOffline) {
      u.isOnline = false;
      u.lastSeen = lastSeen;
    }
    return d;
  });
  if (shouldMarkOffline) {
    emitPresenceToContacts(req.userId, { online: false, lastSeen }, getData());
  }
  res.json({ ok: true });
}

export function logoutEverywhere(req, res) {
  update((d) => {
    d.refreshTokens = d.refreshTokens.map((t) => (t.userId === req.userId ? { ...t, revoked: true } : t));
    d.devices = d.devices.filter((dev) => dev.userId !== req.userId);
    return d;
  });
  emitToUser(req.userId, 'session:revoked-all', { at: now() });
  res.json({ ok: true, message: 'Signed you out everywhere else.' });
}

export function revokeDevice(req, res) {
  const { deviceId } = req.body || req.params;
  if (!deviceId) fail(400, 'deviceId is required.');
  update((d) => {
    const device = d.devices.find((dev) => dev.id === deviceId && dev.userId === req.userId);
    if (device) {
      d.devices = d.devices.filter((dev) => dev.id !== deviceId);
      d.refreshTokens = d.refreshTokens.map((t) => (t.deviceId === deviceId ? { ...t, revoked: true } : t));
    }
    return d;
  });
  res.json({ ok: true, message: 'Device signed out.' });
}
