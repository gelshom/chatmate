import { getData, update, genId, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { publicUser } from '../utils/public.js';
import { fail } from '../middleware/rateLimit.js';
import { notifyUser } from '../services/notify.service.js';

export function sendFriendRequest(req, res) {
  const { uid } = req.params;
  if (uid === req.userId) fail(400, 'You cannot send a request to yourself.');
  const data = getData();
  if (!data.users.some((u) => u.uid === uid)) throw new ApiError(404, 'User not found.');
  if (data.friends.some((f) => (f.userId === req.userId && f.friendId === uid) || (f.userId === uid && f.friendId === req.userId))) {
    fail(409, 'You are already friends.');
  }
  const existing = data.friendRequests.find(
    (r) => (r.senderId === req.userId && r.receiverId === uid) || (r.senderId === uid && r.receiverId === req.userId)
  );
  if (existing?.status === 'pending') fail(409, 'A friend request is already pending.');

  const request = { id: genId('fr'), senderId: req.userId, receiverId: uid, status: 'pending', createdAt: now() };
  update((d) => {
    d.friendRequests = d.friendRequests.filter(
      (r) => !((r.senderId === req.userId && r.receiverId === uid) || (r.senderId === uid && r.receiverId === req.userId))
    );
    d.friendRequests.push(request);
    return d;
  });
  const me = getData().users.find((u) => u.uid === req.userId);
  notifyUser(uid, { title: 'New friend request', body: `${me.username} sent you a friend request`, actorId: req.userId, type: 'friend_request' });
  res.status(201).json({ ok: true, message: 'Friend request sent.', request });
}

export function listIncomingRequests(req, res) {
  const data = getData();
  const requests = data.friendRequests
    .filter((r) => r.receiverId === req.userId && r.status === 'pending')
    .map((r) => ({ ...r, from: publicUser(data.users.find((u) => u.uid === r.senderId), data, req.userId) }));
  res.json({ ok: true, requests });
}

export function declineFriendRequest(req, res) {
  const { requestId } = req.params;
  const request = getData().friendRequests.find(
    (r) => r.id === requestId && r.receiverId === req.userId && r.status === 'pending'
  );
  update((d) => {
    d.friendRequests = d.friendRequests.filter((r) => !(r.id === requestId && r.receiverId === req.userId));
    if (request) {
      d.notifications.forEach((n) => {
        if (n.userId === req.userId && n.type === 'friend_request' && n.actorId === request.senderId) n.read = true;
      });
    }
    return d;
  });
  res.json({ ok: true, message: 'Request declined.' });
}

export function removeFriend(req, res) {
  const { uid } = req.params;
  update((d) => {
    d.friends = d.friends.filter((f) => !((f.userId === req.userId && f.friendId === uid) || (f.userId === uid && f.friendId === req.userId)));
    return d;
  });
  res.json({ ok: true, message: 'Friend removed.' });
}

export function listFriends(req, res) {
  const data = getData();
  const friends = data.friends
    .filter((f) => f.userId === req.userId)
    .map((f) => ({ id: f.id, friendId: f.friendId, friend: publicUser(data.users.find((u) => u.uid === f.friendId), data, req.userId) }));
  res.json({ ok: true, friends });
}

export function isFriends(req, res) {
  const { uid } = req.params;
  const data = getData();
  const friends = data.friends.some((f) => (f.userId === req.userId && f.friendId === uid) || (f.userId === uid && f.friendId === req.userId));
  const incoming = data.friendRequests.some((r) => r.senderId === uid && r.receiverId === req.userId && r.status === 'pending');
  const outgoing = data.friendRequests.some((r) => r.senderId === req.userId && r.receiverId === uid && r.status === 'pending');
  res.json({ ok: true, status: friends ? 'friends' : incoming ? 'incoming' : outgoing ? 'pending' : 'none' });
}
