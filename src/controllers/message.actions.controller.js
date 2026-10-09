import { getData, update, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { fail } from '../middleware/rateLimit.js';
import { emitToChat, emitToUser } from '../services/realtime.js';
import { requireMember } from './message.controller.js';

export function deleteMessage(req, res) {
  const { chatId, messageId } = req.params;
  const { mode = 'for_me' } = req.body || {};
  let removed = null;
  update((d) => {
    const c = d.chats.find((x) => x.chatId === chatId);
    requireMember(c, req.userId, 'chat');
    const m = d.messages.find((x) => x.id === messageId && x.chatId === chatId);
    if (!m) throw new ApiError(404, 'Message not found.');
    if (mode === 'for_everyone') {
      if (m.senderId !== req.userId) throw new ApiError(403, 'You can only delete your own messages everywhere.');
      m.deletedForEveryone = true;
    } else {
      m.deletedForMe = true;
    }
    removed = m;
    return d;
  });
  if (mode === 'for_everyone') emitToChat(chatId, 'message:deleted', { id: messageId });
  else emitToUser(req.userId, 'message:deleted', { id: messageId });
  res.json({ ok: true, message: removed });
}

export function reactToMessage(req, res) {
  const { chatId, messageId } = req.params;
  const { emoji } = req.body || {};
  if (!emoji) fail(400, 'emoji is required.');
  let updated = null;
  update((d) => {
    const c = d.chats.find((x) => x.chatId === chatId);
    requireMember(c, req.userId, 'chat');
    const m = d.messages.find((x) => x.id === messageId && x.chatId === chatId);
    if (!m) throw new ApiError(404, 'Message not found.');
    m.reactions = m.reactions || [];
    const existing = m.reactions.find((r) => r.userId === req.userId);
    if (existing) existing.emoji = String(emoji);
    else m.reactions.push({ userId: req.userId, emoji: String(emoji), createdAt: now() });
    updated = m;
    return d;
  });
  emitToChat(chatId, 'message:reacted', { id: messageId, reactions: updated.reactions });
  res.json({ ok: true, reactions: updated.reactions });
}

export function markDelivered(req, res) {
  const { chatId } = req.params;
  update((d) => {
    requireMember(d.chats.find((x) => x.chatId === chatId), req.userId, 'chat');
    d.messages.forEach((m) => {
      if (m.chatId !== chatId || m.senderId === req.userId) return;
      m.deliveredTo = m.deliveredTo || [];
      if (!m.deliveredTo.includes(req.userId)) {
        m.deliveredTo.push(req.userId);
      }
    });
    return d;
  });
  emitToChat(chatId, 'message:delivered', { chatId, uid: req.userId });
  res.json({ ok: true });
}

export function markRead(req, res) {
  const { chatId } = req.params;
  update((d) => {
    const chat = requireMember(d.chats.find((x) => x.chatId === chatId), req.userId, 'chat');
    d.messages.forEach((m) => {
      if (m.chatId !== chatId || m.senderId === req.userId) return;
      m.deliveredTo = m.deliveredTo || [];
      if (!m.deliveredTo.includes(req.userId)) m.deliveredTo.push(req.userId);
      m.readBy = m.readBy || [];
      if (!m.readBy.includes(req.userId)) m.readBy.push(req.userId);
    });
    const chatMemberIds = new Set(chat.participants.map((participant) => participant.uid));
    d.notifications.forEach((notification) => {
      const belongsToChat = notification.chatId === chatId || (
        !notification.chatId && chat.type === 'direct' && chatMemberIds.has(notification.actorId)
      );
      if (
        notification.userId === req.userId &&
        notification.type === 'message' &&
        belongsToChat
      ) notification.read = true;
    });
    return d;
  });
  emitToChat(chatId, 'message:read', { chatId, uid: req.userId });
  res.json({ ok: true });
}

export function typingStatus(req, res) {
  const { chatId } = req.params;
  const chat = getData().chats.find((x) => x.chatId === chatId);
  requireMember(chat, req.userId, 'chat');
  emitToChat(chatId, 'typing', { chatId, uid: req.userId, isTyping: req.body?.isTyping !== false });
  res.json({ ok: true });
}
