import { getData, update, genId, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { publicUser } from '../utils/public.js';
import {
  emitPresenceToContacts, emitToUser, emitToChat, hasActiveUserConnection,
} from '../services/realtime.js';
import { createDirectChat } from '../services/chat.service.js';
import { notifyUser } from '../services/notify.service.js';

export async function acceptFriendRequest(req, res) {
  const { requestId } = req.params;
  const data = getData();
  const request = data.friendRequests.find(
    (r) => r.id === requestId && r.receiverId === req.userId && r.status === 'pending'
  );
  if (!request) throw new ApiError(404, 'Request not found.');

  const me = data.users.find((u) => u.uid === req.userId);
  const sender = data.users.find((u) => u.uid === request.senderId);

  update((d) => {
    d.friendRequests = d.friendRequests.filter((r) => r.id !== requestId);
    d.friends.push({ id: genId('f'), userId: req.userId, friendId: request.senderId, createdAt: now() });
    d.friends.push({ id: genId('f'), userId: request.senderId, friendId: req.userId, createdAt: now() });
    d.notifications.forEach((notification) => {
      if (
        notification.userId === req.userId &&
        notification.type === 'friend_request' &&
        notification.actorId === request.senderId
      ) notification.read = true;
    });
    return d;
  });

  // Auto-open a direct chat; backend chat id is the same canonical key.
  const chatId = createDirectChat(req.userId, request.senderId);

  notifyUser(request.senderId, {
    title: 'Request accepted',
    body: `${me.username} accepted your friend request`,
    actorId: req.userId,
    type: 'friend_accept',
  });

  const fresh = getData();
  const friend = publicUser(sender, fresh, req.userId);
  const meOnline = hasActiveUserConnection(req.userId);
  const senderOnline = hasActiveUserConnection(request.senderId);
  const meLastSeen = fresh.users.find((user) => user.uid === req.userId)?.lastSeen || null;
  const senderLastSeen = fresh.users.find((user) => user.uid === request.senderId)?.lastSeen || null;
  emitPresenceToContacts(req.userId, {
    online: meOnline,
    lastSeen: meOnline ? null : meLastSeen,
  }, fresh);
  emitPresenceToContacts(request.senderId, {
    online: senderOnline,
    lastSeen: senderOnline ? null : senderLastSeen,
  }, fresh);
  emitToUser(request.senderId, 'friend:added', { user: publicUser(me, fresh, request.senderId) });
  emitToChat(chatId, 'chat:created', { chatId });
  res.json({ ok: true, message: 'Friend request accepted.', friend, chatId });
}
