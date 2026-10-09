import { getData, update } from '../services/store.js';
import { emitToUser } from '../services/realtime.js';
import { publicUser } from '../utils/public.js';
import { ApiError } from '../middleware/error.js';

export function listNotifications(req, res) {
  const data = getData();
  const page = Number(req.query.page) || 1;
  const limit = Math.min(50, Number(req.query.limit) || 20);
  let notifications = data.notifications
    .filter((n) => n.userId === req.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((n) => ({
      ...n,
      actor: publicUser(data.users.find((u) => u.uid === n.actorId), data),
    }));
  const total = notifications.length;
  notifications = notifications.slice((page - 1) * limit, page * limit);
  res.json({ ok: true, notifications, total, page, limit, hasMore: page * limit < total });
}

export function markRead(req, res) {
  const { notificationId } = req.params;
  let notif = null;
  update((d) => {
    const n = d.notifications.find((x) => x.id === notificationId && x.userId === req.userId);
    if (n) {
      n.read = true;
      notif = n;
    }
    return d;
  });
  if (notif) emitToUser(req.userId, 'notification:updated', notif);
  res.json({ ok: true, notification: notif });
}

export function markAllRead(req, res) {
  update((d) => {
    d.notifications.forEach((n) => {
      if (n.userId === req.userId && n.type !== 'message') n.read = true;
    });
    return d;
  });
  res.json({ ok: true });
}

export function markTypeRead(req, res) {
  const { type } = req.body || {};
  if (!['friend_request', 'friend_accept'].includes(type)) {
    throw new ApiError(400, 'Unsupported notification type.');
  }
  update((d) => {
    d.notifications.forEach((n) => {
      if (n.userId === req.userId && n.type === type) n.read = true;
    });
    return d;
  });
  res.json({ ok: true });
}

export function deleteNotification(req, res) {
  const { notificationId } = req.params;
  update((d) => {
    d.notifications = d.notifications.filter((n) => !(n.id === notificationId && n.userId === req.userId));
    return d;
  });
  res.json({ ok: true });
}

export function getUnreadCount(req, res) {
  const data = getData();
  const count = data.notifications.filter((n) => n.userId === req.userId && !n.read && n.type !== 'message').length;
  res.json({ ok: true, unread: count });
}
