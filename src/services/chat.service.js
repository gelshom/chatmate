import { getData, update, now } from './store.js';

/** Canonical id for a 1:1 chat made from two user ids. */
export function directChatId(a, b) {
  return [a, b].sort().join('_');
}

/**
 * Create a direct chat if it does not exist and return its id.
 * Participants are stored as objects { uid, displayName, photoURL } so the
 * conversation list can render them without extra lookups.
 */
export function createDirectChat(meUid, otherUid) {
  const chatId = directChatId(meUid, otherUid);
  const data = getData();
  if (!data.chats.some((c) => c.chatId === chatId)) {
    const me = data.users.find((u) => u.uid === meUid);
    const other = data.users.find((u) => u.uid === otherUid);
    update((d) => {
      d.chats.push({
        chatId,
        type: 'direct',
        title: null,
        participants: [participant(me), participant(other)],
        lastMessage: 'Start a conversation',
        updatedAt: now(),
        createdAt: now(),
        avatar: null,
        isGroup: false,
        pinnedBy: [],
        mutedBy: [],
        archivedBy: [],
      });
      return d;
    });
  }
  return chatId;
}

export function participant(user) {
  return {
    uid: user?.uid,
    displayName: user?.displayName || user?.username || 'Unknown',
    username: user?.username,
    photoURL: user?.photoURL || '',
  };
}

/** Filter chat room member uids (for realtime emit targets). */
export function chatMemberUids(data, chat) {
  if (!chat) return [];
  return chat.participants.map((p) => p.uid).filter(Boolean);
}

/**
 * Validate a client-supplied `replyTo` payload against the store and return a
 * safe snapshot `{ id, senderId, text, createdAt }` to embed in the new
 * message. Returns null when the referenced message does not exist (or was
 * deleted for everyone), so clients can never inject arbitrary data.
 */
export function resolveReplyTo(data, chatId, replyTo) {
  const sourceId = typeof replyTo === 'string' ? replyTo : replyTo?.id;
  if (!sourceId) return null;
  const source = data.messages.find(
    (m) => m.id === sourceId && m.chatId === chatId && !m.deletedForEveryone,
  );
  if (!source) return null;
  return {
    id: source.id,
    senderId: source.senderId,
    text: source.text || '',
    createdAt: source.createdAt,
  };
}