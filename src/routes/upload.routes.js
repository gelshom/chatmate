import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { uploadFile, uploadFiles, deleteFile } from '../controllers/upload.controller.js';

const router = Router();
router.use(requireAuth);
router.post('/file', upload.single('file'), asyncHandler(uploadFile));
router.post('/files', upload.array('files', 10), asyncHandler(uploadFiles));
router.delete('/:name', deleteFile);
export default router;
