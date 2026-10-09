import { getData } from '../services/store.js';
import { config } from '../config.js';
import { isAdminUser } from './admin.js';

const PASSWORD_FIELDS = ['password', 'passwordHash'];

/** Relationship between two users considering friendship + following. */
export function relationshipBetween(data, aUid, bUid) {
  const friends = data.friends.some(
    (f) => (f.userId === aUid && f.friendId === bUid) || (f.userId === bUid && f.friendId === aUid)
  );
  const incoming = data.friendRequests.some((r) => r.senderId === bUid && r.receiverId === aUid && r.status === 'pending');
  const outgoing = data.friendRequests.some((r) => r.senderId === aUid && r.receiverId === bUid && r.status === 'pending');
  const isFollowing = data.following.some((f) => f.userId === aUid && f.followingId === bUid);
  const isFollower = data.following.some((f) => f.userId === bUid && f.followingId === aUid);
  const blocked = data.blocks.some(
    (b) => (b.userId === aUid && b.blockedId === bUid) || (b.userId === bUid && b.blockedId === aUid)
  );
  return {
    friends,
    incoming,
    outgoing,
    isFollowing,
    isFollower,
    blocked,
    status: friends ? 'friends' : incoming ? 'incoming' : outgoing ? 'pending' : isFollowing ? 'following' : 'none',
  };
}

/** A user object that is safe to send to clients. */
export function publicUser(user, data, viewerId) {
  if (!user) return null;
  const out = { ...user };
  PASSWORD_FIELDS.forEach((k) => delete out[k]);
  delete out.resetTokens;
  delete out.refreshTokens;
  const relation = viewerId && viewerId !== user.uid ? relationshipBetween(data, viewerId, user.uid) : {};
  return { ...out, role: isAdminUser(user) ? 'admin' : 'user', ...relation };
}

/** Build the absolute URL for an uploaded file name. */
export function fileUrl(filename) {
  return filename ? `${config.publicUrl}/uploads/${filename}` : '';
}

/** Pagination helper -> { page, limit, skip, take } */
export function paginate(query, max = 50) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(max, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}
