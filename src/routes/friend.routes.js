import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendFriendRequest, listIncomingRequests, declineFriendRequest, removeFriend, listFriends, isFriends } from '../controllers/friend.controller.js';
import { acceptFriendRequest } from '../controllers/friend.accept.controller.js';
import { getData, update, genId, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);
router.post('/request/:uid', sendFriendRequest);
router.get('/', listFriends);
router.get('/requests', listIncomingRequests);
router.post('/requests/:requestId/accept', asyncHandler(acceptFriendRequest));
router.delete('/requests/:requestId', declineFriendRequest);
router.post('/:uid/follow', (req, res) => {
  const { uid } = req.params;
  if (uid === req.userId) throw new ApiError(400, 'You cannot follow yourself.');
  update((data) => {
    if (!data.users.some((user) => user.uid === uid)) throw new ApiError(404, 'User not found.');
    if (!data.following.some((item) => item.userId === req.userId && item.followingId === uid)) {
      data.following.push({ id: genId('follow'), userId: req.userId, followingId: uid, createdAt: now() });
      data.followers.push({ id: genId('follower'), userId: uid, followerId: req.userId, createdAt: now() });
    }
    return data;
  });
  res.json({ ok: true });
});
router.delete('/:uid/follow', (req, res) => {
  update((data) => {
    data.following = data.following.filter((item) => !(item.userId === req.userId && item.followingId === req.params.uid));
    data.followers = data.followers.filter((item) => !(item.userId === req.params.uid && item.followerId === req.userId));
    return data;
  });
  res.json({ ok: true });
});
router.post('/:uid/request', sendFriendRequest);
router.delete('/:uid', removeFriend);
router.get('/:uid/status', isFriends);
export default router;
