import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createStory, listStories, viewStory, reactToStory, deleteStory, myStories, createHighlight, listHighlights } from '../controllers/story.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', listStories);
router.post('/', createStory);
router.get('/mine', myStories);
router.post('/highlights', createHighlight);
router.get('/highlights/:uid', listHighlights);
router.post('/:storyId/view', viewStory);
router.post('/:storyId/reactions', reactToStory);
router.delete('/:storyId', deleteStory);
export default router;
