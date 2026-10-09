import { Router } from 'express';
import { getData, update } from '../services/store.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error.js';
import { publicUser } from '../utils/public.js';

const router = Router();
router.use(requireAuth);
router.get('/me', (req, res) => {
  const data = getData();
  const user = data.users.find((item) => item.uid === req.userId);
  res.json({ ok: true, user: publicUser(user, data, req.userId) });
});
router.get('/suggestions', (req, res) => {
  const data = getData();
  const known = new Set([req.userId, ...data.friends.filter((f) => f.userId === req.userId || f.friendId === req.userId).flatMap((f) => [f.userId, f.friendId])]);
  const users = data.users.filter((user) => !known.has(user.uid) && !user.suspended).slice(0, 30).map((user) => publicUser(user, data, req.userId));
  res.json({ ok: true, users });
});
router.get('/presence', (req, res) => {
  const data = getData();
  res.json({ ok: true, presence: Object.fromEntries(data.users.map((user) => [user.uid, { online: Boolean(user.isOnline), lastSeen: user.lastSeen || null }])) });
});
router.post('/heartbeat', (req, res) => {
  update((data) => {
    const user = data.users.find((item) => item.uid === req.userId);
    if (user) { user.isOnline = true; user.lastSeen = new Date().toISOString(); }
    return data;
  });
  res.json({ ok: true });
});
router.patch('/settings', (req, res) => {
  const allowed = ['notifyMessages', 'notifyFriends', 'notifyGroups', 'readReceipts', 'darkMode'];
  let settings;
  update((data) => {
    settings = data.settings[req.userId] || {};
    for (const key of allowed) if (req.body?.[key] !== undefined) settings[key] = req.body[key];
    data.settings[req.userId] = settings;
    return data;
  });
  res.json({ ok: true, settings });
});
router.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const users = query.length < 2 ? [] : getData().users
    .filter((user) => user.uid !== req.userId && !user.suspended)
    .filter((user) => `${user.username} ${user.displayName} ${user.email}`.toLowerCase().includes(query))
    .slice(0, 30).map((user) => publicUser(user, getData(), req.userId));
  res.json({ ok: true, users });
});
router.get('/u/:uid', (req, res) => {
  const data = getData();
  const user = data.users.find((item) => item.uid === req.params.uid);
  if (!user) throw new ApiError(404, 'User not found.');
  res.json({ ok: true, user: publicUser(user, data, req.userId) });
});
router.patch('/profile', (req, res) => {
  const allowed = ['displayName', 'bio', 'photoURL', 'phone'];
  const data = getData();
  const current = data.users.find((user) => user.uid === req.userId);
  if (!current) throw new ApiError(404, 'User not found.');
  update((snapshot) => {
    const user = snapshot.users.find((item) => item.uid === req.userId);
    for (const key of allowed) if (req.body?.[key] !== undefined) user[key] = String(req.body[key]).slice(0, key === 'bio' ? 500 : 160);
    return snapshot;
  });
  const fresh = getData();
  res.json({ ok: true, user: publicUser(fresh.users.find((user) => user.uid === req.userId), fresh, req.userId) });
});
export default router;
