import { getData, update, now } from '../services/store.js';
import { verifyAccessToken } from '../services/token.service.js';
import {
  roomForUser, roomForChat, addUserConnection, removeUserConnection, hasActiveUserConnection,
} from '../services/realtime.js';
import { notifyUser } from '../services/notify.service.js';
import { resolveReplyTo } from '../services/chat.service.js';

export function initSockets(io) {
  // A process restart closes every socket. Clear any online flags persisted by
  // the previous process so the first presence snapshot cannot show stale users.
  update((d) => {
    d.users.forEach((user) => {
      if (user.isOnline) user.lastSeen = now();
      user.isOnline = false;
    });
    return d;
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required.'));
      const payload = verifyAccessToken(token);
      const user = getData().users.find((u) => u.uid === payload.sub);
      if (!user || user.suspended) return next(new Error('This account is unavailable.'));
      socket.user = user;
      socket.userId = user.uid;
      next();
    } catch (err) {
      next(new Error('Invalid token.'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.userId;
    addUserConnection(uid);
    try {
      update((d) => {
        const u = d.users.find((x) => x.uid === uid);
        if (u) u.isOnline = true;
        return d;
      });
    } catch (err) {
      console.error('[socket] presence update failed', err);
    }
    socket.join(roomForUser(uid));
    joinUserChats(socket, uid);
    markPendingMessagesDelivered(io, uid);

    const data = getData();
    const contacts = userIdsOfContacts(data, uid);
    const presenceSnapshot = {};
    contacts.forEach((contactId) => {
      const contact = data.users.find((user) => user.uid === contactId);
      if (contact) {
        presenceSnapshot[contactId] = {
          online: Boolean(contact.isOnline),
          lastSeen: contact.lastSeen || null,
        };
      }
    });
    socket.emit('presence:snapshot', presenceSnapshot);
    contacts.forEach((c) => io.to(roomForUser(c)).emit('presence', { uid, online: true, lastSeen: null }));

    socket.on('chat:join', (chatId) => {
      const chat = getData().chats.find((c) => c.chatId === chatId);
      if (chat && chat.participants.some((p) => p.uid === uid)) socket.join(roomForChat(chatId));
    });
    socket.on('chat:leave', (chatId) => socket.leave(roomForChat(chatId)));

    socket.on('message:send', (payload, ack) => handleMessageSend(socket, io, payload, ack));
    socket.on('message:delivered', (chatId) => handleMark(socket, io, chatId, 'delivered'));
    socket.on('message:read', (chatId) => handleMark(socket, io, chatId, 'read'));
    socket.on('typing', (chatId) => io.to(roomForChat(chatId)).emit('typing', { chatId, uid, isTyping: true }));
    socket.on('typing:stop', (chatId) => io.to(roomForChat(chatId)).emit('typing', { chatId, uid, isTyping: false }));
    socket.on('presence:update', (online) => handlePresence(io, uid, online));
    socket.on('disconnect', () => handleDisconnect(io, uid));
  });
}

function joinUserChats(socket, uid) {
  const chats = getData().chats.filter((c) => c.participants.some((p) => p.uid === uid));
  chats.forEach((c) => socket.join(roomForChat(c.chatId)));
}

function markPendingMessagesDelivered(io, uid) {
  const deliveredChats = new Set();
  try {
    update((d) => {
      d.messages.forEach((message) => {
        const chat = d.chats.find((item) => item.chatId === message.chatId);
        if (!chat || chat.type === 'group' || message.senderId === uid) return;
        message.deliveredTo = message.deliveredTo || [];
        if (!message.deliveredTo.includes(uid)) {
          message.deliveredTo.push(uid);
          deliveredChats.add(message.chatId);
        }
      });
      return d;
    });
    deliveredChats.forEach((chatId) => {
      io.to(roomForChat(chatId)).emit('message:delivered', { chatId, uid });
    });
  } catch (err) {
    console.error('[socket] pending delivery receipt failed', err);
  }
}

function userIdsOfContacts(data, uid) {
  const set = new Set();
  data.friends.forEach((f) => {
    if (f.userId === uid) set.add(f.friendId);
    if (f.friendId === uid) set.add(f.userId);
  });
  data.followers.forEach((f) => {
    if (f.userId === uid) set.add(f.followerId);
    if (f.followerId === uid) set.add(f.userId);
  });
  return [...set];
}

function handleMessageSend(socket, io, payload, ack) {
  try {
    const uid = socket.userId;
    const { chatId, text, type = 'text', image, file, voice, replyTo } = payload || {};
    const data = getData();
    const chat = data.chats.find((c) => c.chatId === chatId);
    if (!chat || !chat.participants.some((p) => p.uid === uid)) {
      if (typeof ack === 'function') ack({ ok: false, message: 'Chat not found or you are not a member.' });
      return;
    }
    const message = {
      id: `msg-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
      chatId,
      senderId: uid,
      type,
      text: text || '',
      image: image || null,
      file: file || null,
      voice: voice || null,
      replyTo: resolveReplyTo(data, chatId, replyTo),
      reactions: [],
      readBy: [uid],
      deliveredTo: [uid, ...(chat.type === 'group' ? [] : chat.participants
        .filter((participant) => participant.uid !== uid && hasActiveUserConnection(participant.uid))
        .map((participant) => participant.uid))],
      edited: false,
      deletedForMe: false,
      deletedForEveryone: false,
      createdAt: new Date().toISOString(),
    };
    update((d) => {
      d.messages.push(message);
      const c = d.chats.find((x) => x.chatId === chatId);
      if (c) { c.lastMessage = text || (file?.name || (image ? 'Attachment' : '')); c.lastSenderId = uid; c.updatedAt = now(); }
      return d;
    });
    io.to(roomForChat(chatId)).emit('message:new', message);

    const senderName = getData().users.find((u) => u.uid === uid)?.username || 'Someone';
    chat.participants.forEach((p) => {
      if (p.uid === uid) return;
      const settings = getData().settings[p.uid] || {};
      const muted = (chat.mutedBy || []).includes(p.uid);
      if (!muted && settings.notifyMessages !== false && chat.type !== 'group') {
        notifyUser(p.uid, {
          title: 'New message',
          body: `From ${senderName}: ${String(text || '').slice(0, 60) || 'An attachment'}`,
          actorId: uid,
          type: 'message',
          chatId,
        });
      }
    });
    if (typeof ack === 'function') ack({ ok: true, message });
  } catch (err) {
    console.error('[socket] message:send failed', err);
    if (typeof ack === 'function') ack({ ok: false, message: 'Failed to send message.' });
  }
}

function handleMark(socket, io, chatId, kind) {
  try {
    const uid = socket.userId;
    update((d) => {
      const c = d.chats.find((x) => x.chatId === chatId);
      if (!c || !c.participants.some((p) => p.uid === uid)) return d;
      d.messages.forEach((m) => {
        if (m.chatId !== chatId || m.senderId === uid) return;
        m.deliveredTo = m.deliveredTo || [];
        if (kind === 'read' && !m.deliveredTo.includes(uid)) m.deliveredTo.push(uid);
        m.readBy = m.readBy || [];
        const list = kind === 'read' ? m.readBy : m.deliveredTo;
        if (!list.includes(uid)) list.push(uid);
      });
      return d;
    });
    io.to(roomForChat(chatId)).emit(`message:${kind}`, { chatId, uid });
  } catch (err) {
    console.error('[socket] message:mark failed', err);
  }
}

function handlePresence(io, uid, online) {
  try {
    // A connected authenticated socket means this user is online. Offline state
    // is set only after the final device disconnects.
    const resolvedOnline = Boolean(online) || hasActiveUserConnection(uid);
    const lastSeen = resolvedOnline ? null : now();
    update((d) => {
      const u = d.users.find((x) => x.uid === uid);
      if (u) { u.isOnline = resolvedOnline; if (!resolvedOnline) u.lastSeen = lastSeen; }
      return d;
    });
    userIdsOfContacts(getData(), uid).forEach((contactId) => {
      io.to(roomForUser(contactId)).emit('presence', { uid, online: resolvedOnline, lastSeen });
    });
  } catch (err) {
    console.error('[socket] presence:update failed', err);
  }
}

function handleDisconnect(io, uid) {
  const remainingConnections = removeUserConnection(uid);
  if (remainingConnections > 0) return;

  try {
    const lastSeen = now();
    update((d) => {
      const u = d.users.find((x) => x.uid === uid);
      if (u) { u.isOnline = false; u.lastSeen = lastSeen; }
      return d;
    });
    userIdsOfContacts(getData(), uid).forEach((contactId) => {
      io.to(roomForUser(contactId)).emit('presence', { uid, online: false, lastSeen });
    });
  } catch (err) {
    console.error('[socket] disconnect handler failed', err);
  }
}
