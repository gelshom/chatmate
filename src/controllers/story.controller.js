import { getData, update, genId, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { fail } from '../middleware/rateLimit.js';
import { emitToUser } from '../services/realtime.js';
import { publicUser } from '../utils/public.js';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function listActiveStoriesFor(data, viewerId) {
  const nowMs = Date.now();
  return data.stories
    .filter((s) => new Date(s.expiresAt).getTime() > nowMs)
    .filter((s) => {
      if (s.userId === viewerId) return true;
      const isFollower = data.followers.some((f) => f.userId === s.userId && f.followerId === viewerId);
      const isFriend = data.friends.some((f) => (f.userId === s.userId && f.friendId === viewerId) || (f.userId === viewerId && f.friendId === s.userId));
      return isFollower || isFriend;
    });
}

export function createStory(req, res) {
  const { media, type = 'image', text, caption } = req.body || {};
  if (!media) fail(400, 'media (url or file object) is required.');
  const story = {
    id: genId('story'),
    userId: req.userId,
    media,
    type,
    text: text || '',
    caption: caption || '',
    viewCount: 0,
    views: [],
    reactions: [],
    createdAt: now(),
    expiresAt: new Date(Date.now() + STORY_TTL_MS).toISOString(),
  };
  update((d) => {
    d.stories.push(story);
    return d;
  });
  const fresh = getData();
  const watchers = fresh.stories.filter((s) => s.userId === req.userId);
  const audienceIds = new Set(fresh.followers.filter((f) => f.userId === req.userId).map((f) => f.followerId));
  audienceIds.forEach((uid) => {
    emitToUser(uid, 'story:new', { userId: req.userId, count: watchers.length });
  });
  res.status(201).json({ ok: true, story });
}

export function listStories(req, res) {
  const data = getData();
  const stories = listActiveStoriesFor(data, req.userId);
  // Group by author (like Instagram's story tray).
  const byUser = {};
  for (const s of stories) {
    const author = data.users.find((u) => u.uid === s.userId);
    if (!byUser[s.userId]) byUser[s.userId] = { user: publicUser(author, data), stories: [] };
    byUser[s.userId].stories.push(s);
  }
  const tray = Object.values(byUser).sort((a, b) => new Date(b.stories[0].createdAt) - new Date(a.stories[0].createdAt));
  res.json({ ok: true, tray });
}

export function viewStory(req, res) {
  const { storyId } = req.params;
  let story = null;
  update((d) => {
    const s = d.stories.find((x) => x.id === storyId);
    if (!s) throw new ApiError(404, 'Story not found.');
    if (s.userId !== req.userId && !s.views.includes(req.userId)) {
      s.views.push(req.userId);
      s.viewCount = s.views.length;
    }
    story = s;
    return d;
  });
  emitToUser(story.userId, 'story:viewed', { storyId, viewerId: req.userId });
  res.json({ ok: true, story });
}

export function reactToStory(req, res) {
  const { storyId } = req.params;
  const { emoji } = req.body || {};
  if (!emoji) fail(400, 'emoji is required.');
  let story = null;
  update((d) => {
    const s = d.stories.find((x) => x.id === storyId);
    if (!s) throw new ApiError(404, 'Story not found.');
    s.reactions = s.reactions || [];
    s.reactions.push({ userId: req.userId, emoji: String(emoji), createdAt: now() });
    story = s;
    return d;
  });
  emitToUser(story.userId, 'story:reacted', { storyId, viewerId: req.userId, emoji });
  res.json({ ok: true, story });
}

export function deleteStory(req, res) {
  const { storyId } = req.params;
  update((d) => {
    const s = d.stories.find((x) => x.id === storyId && x.userId === req.userId);
    if (!s) return d;
    d.stories = d.stories.filter((x) => x.id !== storyId);
    return d;
  });
  res.json({ ok: true });
}

export function myStories(req, res) {
  const data = getData();
  const stories = data.stories
    .filter((s) => s.userId === req.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, stories });
}

export function createHighlight(req, res) {
  const { title, storyIds } = req.body || {};
  if (!title || !String(title).trim()) fail(400, 'A highlight title is required.');
  if (!Array.isArray(storyIds) || !storyIds.length) fail(400, 'storyIds is required.');
  const data = getData();
  const myStories = data.stories.filter((s) => s.userId === req.userId);
  const validIds = storyIds.filter((id) => myStories.some((s) => s.id === id));
  const highlight = {
    id: genId('hl'),
    userId: req.userId,
    title: String(title).trim(),
    storyIds: validIds,
    createdAt: now(),
  };
  update((d) => {
    d.highlights.push(highlight);
    return d;
  });
  res.status(201).json({ ok: true, highlight });
}

export function listHighlights(req, res) {
  const data = getData();
  const { uid } = req.params;
  const highlights = data.highlights
    .filter((h) => h.userId === uid)
    .map((h) => ({
      ...h,
      stories: data.stories.filter((s) => h.storyIds.includes(s.id) && new Date(s.expiresAt) > new Date()),
    }));
  res.json({ ok: true, highlights });
}