import { getData, update, genId, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { fail } from '../middleware/rateLimit.js';
import { emitToChat, hasActiveUserConnection } from '../services/realtime.js';
import { chatMemberUids, resolveReplyTo } from '../services/chat.service.js';
import { notifyUser } from '../services/notify.service.js';

export function requireMember(chat, uid, label = 'chat') {
  if (!chat) throw new ApiError(404, `${label} not found.`);
  if (!chat.participants.some((p) => p.uid === uid)) throw new ApiError(403, 'You are not a member of this chat.');
  return chat;
}

export function findChatFor(chatId, uid) {
  const chat = getData().chats.find((c) => c.chatId === chatId);
  return requireMember(chat, uid, 'chat');
}

export function sendMessage(req, res) {
  const { chatId } = req.params;
  const { text, type = 'text', image, file, voice, replyTo } = req.body || {};
  const data = getData();
  const chat = data.chats.find((c) => c.chatId === chatId);
  requireMember(chat, req.userId, 'chat');

  const attachment = file || image || voice || null;
  const deliveredTo = [req.userId];
  if (chat.type !== 'group') {
    chat.participants
      .filter((participant) => participant.uid !== req.userId)
      .forEach((participant) => {
        if (hasActiveUserConnection(participant.uid)) deliveredTo.push(participant.uid);
      });
  }

  const message = {
    id: genId('msg'),
    chatId,
    senderId: req.userId,
    type,
    text: text || '',
    image: image || null,
    file: file || null,
    voice: voice || null,
    replyTo: resolveReplyTo(data, chatId, replyTo),
    reactions: [],
    readBy: [req.userId],
    deliveredTo,
    edited: false,
    deletedForMe: false,
    deletedForEveryone: false,
    createdAt: now(),
  };

  update((d) => {
    d.messages.push(message);
    const c = d.chats.find((x) => x.chatId === chatId);
    if (c) {
      c.lastMessage = text || (attachment ? (file?.name || 'Attachment') : '');
      c.lastSenderId = req.userId;
      c.updatedAt = now();
    }
    return d;
  });

  emitToChat(chatId, 'message:new', message);

  const senderName = data.users.find((u) => u.uid === req.userId)?.username || 'Someone';
  const memberIds = chatMemberUids(getData(), chat).filter((uid) => uid !== req.userId);
  memberIds.forEach((uid) => {
    const settings = getData().settings[uid] || {};
    if (settings.notifyMessages !== false && chat.type !== 'group') {
      notifyUser(uid, {
        title: 'New message',
        body: `From ${senderName}: ${String(text || '').slice(0, 60) || 'An attachment'}`,
        actorId: req.userId,
        type: 'message',
        chatId,
      });
    }
  });

  res.status(201).json({ ok: true, message });
}

export function listMessages(req, res) {
  const { chatId } = req.params;
  const data = getData();
  const chat = data.chats.find((c) => c.chatId === chatId);
  requireMember(chat, req.userId, 'chat');

  let messages = data.messages
    .filter((m) => m.chatId === chatId && !m.deletedForEveryone)
    .filter((m) => !(m.deletedForMe === true && m.senderId === req.userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (req.query.before) messages = messages.filter((m) => m.createdAt < req.query.before);
  const page = Number(req.query.page) || 1;
  const limit = Math.min(50, Number(req.query.limit) || 30);
  const total = messages.length;
  messages = messages.slice((page - 1) * limit, page * limit).reverse();
  res.json({ ok: true, messages, total, page, limit, hasMore: page * limit < total });
}

export function editMessage(req, res) {
  const { chatId, messageId } = req.params;
  const { text } = req.body || {};
  if (!text) fail(400, 'text is required.');
  let updated = null;
  update((d) => {
    const c = d.chats.find((x) => x.chatId === chatId);
    requireMember(c, req.userId, 'chat');
    const m = d.messages.find((x) => x.id === messageId && x.chatId === chatId);
    if (!m) throw new ApiError(404, 'Message not found.');
    if (m.senderId !== req.userId) throw new ApiError(403, 'You can only edit your own messages.');
    m.text = String(text);
    m.edited = true;
    m.editedAt = now();
    updated = m;
    return d;
  });
  emitToChat(chatId, 'message:updated', updated);
  res.json({ ok: true, message: updated });
}
