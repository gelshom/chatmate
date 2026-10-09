/**
 * Thin wrapper around Socket.IO so REST controllers can push realtime
 * events to connected clients. Keeps Socket.IO optional: if no client is
 * connected the emit calls are simply no-ops.
 */
let ioInstance = null;
const userConnections = new Map();

export function setIO(io) {
  ioInstance = io;
}

export function getIO() {
  return ioInstance;
}

export function addUserConnection(uid) {
  const count = (userConnections.get(uid) || 0) + 1;
  userConnections.set(uid, count);
  return count;
}

export function removeUserConnection(uid) {
  const count = Math.max(0, (userConnections.get(uid) || 0) - 1);
  if (count === 0) userConnections.delete(uid);
  else userConnections.set(uid, count);
  return count;
}

export function hasActiveUserConnection(uid) {
  return (userConnections.get(uid) || 0) > 0;
}

export function roomForUser(uid) {
  return `user:${uid}`;
}

export function roomForChat(chatId) {
  return `chat:${chatId}`;
}

/** Emit an event to every device of a single user. */
export function emitToUser(uid, event, payload) {
  if (!ioInstance || !uid) return;
  ioInstance.to(roomForUser(uid)).emit(event, payload);
}

/** Emit an event to every member of a chat (direct or group). */
export function emitToChat(chatId, event, payload) {
  if (!ioInstance || !chatId) return;
  ioInstance.to(roomForChat(chatId)).emit(event, payload);
}

export function emitPresenceToContacts(uid, payload, data) {
  const contacts = new Set();
  data.friends.forEach((friendship) => {
    if (friendship.userId === uid) contacts.add(friendship.friendId);
    if (friendship.friendId === uid) contacts.add(friendship.userId);
  });
  data.followers.forEach((follow) => {
    if (follow.userId === uid) contacts.add(follow.followerId);
    if (follow.followerId === uid) contacts.add(follow.userId);
  });
  contacts.forEach((contactId) => emitToUser(contactId, 'presence', { uid, ...payload }));
}

/** Emit to everyone (broadcast). */
export function emitBroadcast(event, payload) {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
}
