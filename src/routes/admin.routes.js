import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { deleteAccount, listAccounts, updateAccount } from '../controllers/admin.controller.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/users', asyncHandler(listAccounts));
router.patch('/users/:uid', asyncHandler(updateAccount));
router.delete('/users/:uid', asyncHandler(deleteAccount));

export default router;
