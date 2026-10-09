import { getData, update, genId, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { fail } from '../middleware/rateLimit.js';
import { emitToChat } from '../services/realtime.js';
import { participant, directChatId } from '../services/chat.service.js';
import { notifyUser } from '../services/notify.service.js';
import { requireMember } from './message.controller.js';
import { publicUser } from '../utils/public.js';

export function createDirectChatHandler(req, res) {
  const { uid } = req.params;
  if (uid === req.userId) fail(400, 'You cannot chat with yourself.');
  if (!getData().users.some((u) => u.uid === uid)) throw new ApiError(404, 'User not found.');
  const chatId = directChatId(req.userId, uid);
  const data = getData();
  if (!data.chats.some((c) => c.chatId === chatId)) {
    const me = data.users.find((u) => u.uid === req.userId);
    const other = data.users.find((u) => u.uid === uid);
    update((d) => {
      d.chats.push({
        chatId,
        type: 'direct',
        title: null,
        avatar: null,
        participants: [participant(me), participant(other)],
        lastMessage: 'Start a conversation',
        updatedAt: now(),
        createdAt: now(),
        createdBy: req.userId,
        pinnedBy: [],
        mutedBy: [],
        archivedBy: [],
      });
      return d;
    });
  }
  res.status(201).json({ ok: true, chat: getData().chats.find((c) => c.chatId === chatId) });
}

export function createGroup(req, res) {
  const { name, memberIds = [], avatar } = req.body || {};
  if (!name || !String(name).trim()) fail(400, 'A group name is required.');
  const memberSet = new Set([req.userId, ...(Array.isArray(memberIds) ? memberIds : [])]);
  const data = getData();
  const participants = data.users
    .filter((u) => memberSet.has(u.uid))
    .map((u) => ({ ...participant(u), role: u.uid === req.userId ? 'owner' : 'member' }));

  const chat = {
    chatId: genId('g'),
    type: 'group',
    title: String(name).trim(),
    avatar: avatar || null,
    participants,
    lastMessage: `${data.users.find((u) => u.uid === req.userId)?.username} created the group`,
    updatedAt: now(),
    createdAt: now(),
    createdBy: req.userId,
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
  };
  update((d) => {
    d.chats.push(chat);
    return d;
  });
  const ownerName = data.users.find((u) => u.uid === req.userId)?.username || 'Someone';
  participants.forEach((p) => {
    if (p.uid !== req.userId) {
      notifyUser(p.uid, { title: 'Added to a group', body: `${ownerName} added you to ${chat.title}`, actorId: req.userId, type: 'group' });
    }
  });
  res.status(201).json({ ok: true, chat });
}

export function getChat(req, res) {
  const { chatId } = req.params;
  const data = getData();
  const chat = data.chats.find((c) => c.chatId === chatId);
  requireMember(chat, req.userId, 'chat');
  res.json({ ok: true, chat: serializeChat(chat, data, req.userId) });
}

export function listChats(req, res) {
  const data = getData();
  const chats = data.chats
    .filter((c) => c.participants.some((p) => p.uid === req.userId) && !c.archivedBy.includes(req.userId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((c) => serializeChat(c, data, req.userId));
  res.json({ ok: true, chats });
}

export function listArchived(req, res) {
  const data = getData();
  const chats = data.chats
    .filter((c) => c.participants.some((p) => p.uid === req.userId) && c.archivedBy.includes(req.userId))
    .map((c) => serializeChat(c, data, req.userId));
  res.json({ ok: true, chats });
}

export function renameGroup(req, res) {
  const { chatId } = req.params;
  const { name } = req.body || {};
  if (!name || !String(name).trim()) fail(400, 'A group name is required.');
  let chat = null;
  update((d) => {
    const c = d.chats.find((x) => x.chatId === chatId);
    requireMember(c, req.userId, 'chat');
    if (c.type !== 'group') throw new ApiError(400, 'Only groups can be renamed.');
    const me = c.participants.find((p) => p.uid === req.userId);
    if (me.role !== 'owner' && me.role !== 'admin') throw new ApiError(403, 'Only admins can rename the group.');
    c.title = String(name).trim();
    c.updatedAt = now();
    chat = c;
    return d;
  });
  emitToChat(chatId, 'chat:updated', { chatId, title: chat.title });
  res.json({ ok: true, chat });
}

export function updateGroupAvatar(req, res) {
  const { chatId } = req.params;
  const { avatar } = req.body || {};
  if (!avatar) fail(400, 'avatar is required.');
  let chat = null;
  update((d) => {
    const c = d.chats.find((x) => x.chatId === chatId);
    requireMember(c, req.userId, 'chat');
    if (c.type !== 'group') throw new ApiError(400, 'Only groups have avatars.');
    c.avatar = String(avatar);
    c.updatedAt = now();
    chat = c;
    return d;
  });
  emitToChat(chatId, 'chat:updated', { chatId, avatar: chat.avatar });
  res.json({ ok: true, chat });
}

export function serializeChat(chat, data, viewerId) {
  return {
    ...chat,
    unreadCount: data.messages.filter((message) =>
      message.chatId === chat.chatId &&
      message.senderId !== viewerId &&
      !message.deletedForEveryone &&
      Array.isArray(message.readBy) &&
      !message.readBy.includes(viewerId)
    ).length,
    participants: chat.participants.map((p) => ({ ...p, user: publicUser(data.users.find((u) => u.uid === p.uid), data, viewerId) })),
  };
}
