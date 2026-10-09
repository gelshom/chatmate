import { getData, update } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { isAdminUser, isBootstrapAdmin } from '../utils/admin.js';
import { removeAccountData } from './account.controller.js';
import { emitToUser } from '../services/realtime.js';

function adminAccount(user) {
  return {
    uid: user.uid,
    username: user.username || '',
    displayName: user.displayName || '',
    email: user.email || '',
    role: isAdminUser(user) ? 'admin' : 'user',
    bootstrapAdmin: isBootstrapAdmin(user),
    suspended: Boolean(user.suspended),
    emailVerified: Boolean(user.emailVerified),
    isOnline: Boolean(user.isOnline),
    createdAt: user.createdAt || null,
  };
}

export function listAccounts(req, res) {
  const data = getData();
  const query = String(req.query.q || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const matches = data.users
    .filter((user) => !query || [user.username, user.displayName, user.email].some((value) => String(value || '').toLowerCase().includes(query)))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const users = matches.slice((page - 1) * limit, page * limit).map(adminAccount);
  const admins = data.users.filter(isAdminUser).length;
  res.json({
    ok: true,
    users,
    total: matches.length,
    page,
    limit,
    stats: {
      total: data.users.length,
      active: data.users.filter((user) => !user.suspended).length,
      suspended: data.users.filter((user) => user.suspended).length,
      admins,
    },
  });
}

export function updateAccount(req, res) {
  const { uid } = req.params;
  const { role, suspended } = req.body || {};
  if (role === undefined && suspended === undefined) throw new ApiError(400, 'Provide a role or suspended status to update.');
  if (role !== undefined && !['user', 'admin'].includes(role)) throw new ApiError(400, 'Role must be user or admin.');
  if (suspended !== undefined && typeof suspended !== 'boolean') throw new ApiError(400, 'Suspended status must be true or false.');
  if (uid === req.userId && (role === 'user' || suspended === true)) {
    throw new ApiError(400, 'You cannot remove your own administrator access or suspend your account.');
  }

  let updated = null;
  update((data) => {
    const user = data.users.find((entry) => entry.uid === uid);
    if (!user) throw new ApiError(404, 'Account not found.');
    if (role === 'user' && isBootstrapAdmin(user)) {
      throw new ApiError(400, 'This administrator is configured with ADMIN_EMAIL and cannot be demoted here.');
    }
    if (role !== undefined) user.role = role;
    if (suspended !== undefined) user.suspended = suspended;
    if (!data.users.some((entry) => isAdminUser(entry) && !entry.suspended)) {
      throw new ApiError(400, 'At least one active administrator must remain.');
    }
    updated = adminAccount(user);
    return data;
  });
  if (suspended === true) emitToUser(uid, 'account:suspended', {});
  res.json({ ok: true, user: updated });
}

export function deleteAccount(req, res) {
  const { uid } = req.params;
  if (uid === req.userId) throw new ApiError(400, 'You cannot delete your own account from the admin dashboard.');
  update((data) => {
    const user = data.users.find((entry) => entry.uid === uid);
    if (!user) throw new ApiError(404, 'Account not found.');
    if (isAdminUser(user) && !data.users.some((entry) => entry.uid !== uid && isAdminUser(entry) && !entry.suspended)) {
      throw new ApiError(400, 'The last active administrator account cannot be deleted.');
    }
    removeAccountData(data, uid);
    return data;
  });
  emitToUser(uid, 'account:removed', {});
  res.json({ ok: true, message: 'Account deleted.' });
}
