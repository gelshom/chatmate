import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendMessage, listMessages, editMessage } from '../controllers/message.controller.js';
import { deleteMessage, reactToMessage, markDelivered, markRead, typingStatus } from '../controllers/message.actions.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/:chatId/messages', listMessages);
router.post('/:chatId/messages', sendMessage);
router.patch('/:chatId/messages/:messageId', editMessage);
router.delete('/:chatId/messages/:messageId', deleteMessage);
router.post('/:chatId/messages/:messageId/react', reactToMessage);
router.post('/:chatId/messages/:messageId/reactions', reactToMessage);
router.post('/:chatId/delivered', markDelivered);
router.post('/:chatId/read', markRead);
router.post('/:chatId/typing', typingStatus);
export default router;
