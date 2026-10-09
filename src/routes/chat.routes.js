import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createDirectChatHandler, createGroup, getChat, listChats, listArchived, renameGroup, updateGroupAvatar } from '../controllers/chat.controller.js';
import { getData, update } from '../services/store.js';
import { ApiError } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);
router.get('/', listChats);
router.get('/archived', listArchived);
router.post('/direct/:uid', createDirectChatHandler);
router.post('/group', createGroup);
router.post('/groups', createGroup);
for (const [action, field] of [['pin', 'pinnedBy'], ['mute', 'mutedBy'], ['archive', 'archivedBy']]) {
  router.post(`/:chatId/${action}`, (req, res) => {
    const { chatId } = req.params;
    const enabled = req.body?.[action === 'pin' ? 'pinned' : action === 'mute' ? 'muted' : 'archived'] !== false;
    update((data) => {
      const chat = data.chats.find((item) => item.chatId === chatId);
      if (!chat) throw new ApiError(404, 'Chat not found.');
      if (!chat.participants.some((participant) => participant.uid === req.userId)) throw new ApiError(403, 'You are not a member of this chat.');
      chat[field] = Array.isArray(chat[field]) ? chat[field] : [];
      chat[field] = enabled ? [...new Set([...chat[field], req.userId])] : chat[field].filter((uid) => uid !== req.userId);
      return data;
    });
    res.json({ ok: true, [action === 'pin' ? 'pinned' : action === 'mute' ? 'muted' : 'archived']: enabled });
  });
}
router.get('/:chatId', getChat);
router.patch('/:chatId/name', renameGroup);
router.patch('/:chatId/avatar', updateGroupAvatar);
export default router;
