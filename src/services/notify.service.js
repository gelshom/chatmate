import { getData, genId, now, update } from './store.js';
import { emitToUser } from './realtime.js';

export function notifyUser(userId, input) {
  const notification = {
    id: genId('notice'), userId, actorId: input.actorId || null,
    title: String(input.title || ''), body: String(input.body || ''),
    type: input.type || 'general', chatId: input.chatId || null,
    read: false, createdAt: now(),
  };
  update((data) => { data.notifications.push(notification); return data; });
  emitToUser(userId, 'notification:new', notification);
  return notification;
}
