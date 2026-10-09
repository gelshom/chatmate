import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  listNotifications, markRead, markAllRead, markTypeRead, deleteNotification, getUnreadCount,
} from '../controllers/notification.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listNotifications));
router.get('/unread-count', asyncHandler(getUnreadCount));
router.post('/read-all', asyncHandler(markAllRead));
router.post('/read-type', asyncHandler(markTypeRead));
router.post('/:notificationId/read', asyncHandler(markRead));
router.delete('/:notificationId', asyncHandler(deleteNotification));

export default router;
