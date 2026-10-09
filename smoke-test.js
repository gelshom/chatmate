/**
 * Smoke test for the ChatMate backend.
 * Starts the real server (buildApp), runs through the main API flows and
 * prints a report to the console so the user can see everything works.
 *
 * Runs against a throwaway database so the dev data in server/data is never
 * touched. `config.js` reads process.env at import time, so the env vars must
 * be set before the dynamic import below.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.SMOKE_PORT) || 4173;
const BASE = `http://localhost:${PORT}`;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chatmate-smoke-'));
process.env.DB_FILE = path.join(TMP_DIR, 'app.json');
process.env.UPLOAD_DIR = path.join(TMP_DIR, 'uploads');

const { buildApp } = await import('./src/app.js');

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  // `detail` is sometimes a whole response object; keep the log readable.
  const text = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${text ? '  -> ' + text : ''}`);
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

const { app, server } = buildApp();

const listen = () =>
  new Promise((resolve) => {
    server.listen(PORT, resolve);
  });

const close = () =>
  new Promise((resolve) => {
    server.close(resolve);
  });

await listen();

try {
  // 1. Health
  const health = await req('GET', '/health');
  record('GET /health', health.status === 200 && health.json.ok === true);

  // 2. API root
  const apiRoot = await req('GET', '/api');
  record('GET /api', apiRoot.status === 200 && apiRoot.json.ok === true);

  // 3. Register
  const email = `smoke${Date.now()}@test.dev`;
  const username = `smoke${Date.now()}`;
  const register = await req('POST', '/api/auth/register', {
    email, password: 'secret123', username, displayName: 'Smoke Tester',
  });
  record('POST /api/auth/register', register.status === 201 && !!register.json.accessToken, register.json.message || '');
  const registerToken = register.json.accessToken;

  // 4. Register duplicate email -> 409
  const dup = await req('POST', '/api/auth/register', {
    email, password: 'secret123', username: 'anotherone',
  });
  record('POST register duplicate email -> 409', dup.status === 409);

  // 5. Login
  const login = await req('POST', '/api/auth/login', { identifier: email, password: 'secret123' });
  record('POST /api/auth/login', login.status === 200 && !!login.json.accessToken, login.json.message || '');
  const token = login.json.accessToken;
  const refreshToken = login.json.refreshToken;

  // 6. Bad login -> 401
  const badLogin = await req('POST', '/api/auth/login', { identifier: email, password: 'wrongpass' });
  record('POST login wrong password -> 401', badLogin.status === 401);

  // 7. /api/auth/me
  const me = await req('GET', '/api/auth/me', null, token);
  record('GET /api/auth/me', me.status === 200 && me.json.user?.uid === register.json.user?.uid);

  // 8. Get /api/users/me with same token
  const me2 = await req('GET', '/api/users/me', null, token);
  record('GET /api/users/me', me2.status === 200 && !!me2.json.user);

  // 9. No token -> 401
  const noToken = await req('GET', '/api/users/me');
  record('GET /api/users/me (no token) -> 401', noToken.status === 401);

  // 10. Refresh
  const refreshed = await req('POST', '/api/auth/refresh', { refreshToken });
  record('POST /api/auth/refresh', refreshed.status === 200 && !!refreshed.json.accessToken);

  // 11. Search users
  const search = await req('GET', '/api/users/search?q=smoke', null, token);
  record('GET /api/users/search', search.status === 200 && Array.isArray(search.json.users));

  // 12. Suggest friends
  const sugg = await req('GET', '/api/users/suggestions', null, token);
  record('GET /api/users/suggestions', sugg.status === 200 && Array.isArray(sugg.json.users));

  // 13. Create group
  const group = await req('POST', '/api/chats/groups', { name: 'Smoke Group', memberIds: [] }, token);
  record('POST /api/chats/groups', group.status === 201 && !!group.json.chat?.chatId, group.json.message || '');
  const groupId = group.json.chat?.chatId;

  // 14. List chats
  const chats = await req('GET', '/api/chats', null, token);
  record('GET /api/chats', chats.status === 200 && Array.isArray(chats.json.chats));

  // 15. Send a message to the group
  const sendMsg = await req('POST', '/api/messages/' + groupId + '/messages', { text: 'Hello group!' }, token);
  record('POST /api/messages/:chatId/messages', sendMsg.status === 201 && !!sendMsg.json.message?.id, sendMsg.json.message || '');
  const messageId = sendMsg.json.message?.id;
// 16. List messages
  const listMsg = await req('GET', '/api/messages/' + groupId + '/messages', null, token);
  record('GET /api/messages/:chatId/messages', listMsg.status === 200 && listMsg.json.total >= 1);

  // 17. Edit message
  const editMsg = await req('PATCH', `/api/messages/${groupId}/messages/${messageId}`, { text: 'Edited!' }, token);
  record('PATCH message', editMsg.status === 200 && editMsg.json.message?.edited === true);

  // 17b. Reply to a message -> safe snapshot stored
  const replyMsg = await req('POST', `/api/messages/${groupId}/messages`, { text: 'Replying to the edit', replyTo: { id: messageId } }, token);
  record('POST reply stores replyTo snapshot', replyMsg.status === 201
    && replyMsg.json.message?.replyTo?.id === messageId
    && replyMsg.json.message?.replyTo?.senderId === register.json.user?.uid
    && replyMsg.json.message?.replyTo?.text === 'Edited!');

  // 17c. Reply referencing an unknown message -> replyTo null
  const ghostReply = await req('POST', `/api/messages/${groupId}/messages`, { text: 'Ghost reply', replyTo: { id: 'msg-does-not-exist' } }, token);
  record('POST reply with unknown message -> replyTo null', ghostReply.status === 201 && ghostReply.json.message?.replyTo === null);

  // 18. React to message
  const reactMsg = await req('POST', `/api/messages/${groupId}/messages/${messageId}/react`, { emoji: '👍' }, token);
  record('POST message react', reactMsg.status === 200 && reactMsg.json.reactions?.length === 1);

  // 19. Mark read
  const markRead = await req('POST', `/api/messages/${groupId}/read`, {}, token);
  record('POST mark read', markRead.status === 200);

  // 20. Pin / mute / archive a chat
  const pin = await req('POST', `/api/chats/${groupId}/pin`, { pinned: true }, token);
  record('POST chat pin', pin.status === 200 && pin.json.pinned === true);
  const mute = await req('POST', `/api/chats/${groupId}/mute`, { muted: true }, token);
  record('POST chat mute', mute.status === 200 && mute.json.muted === true);
  const archive = await req('POST', `/api/chats/${groupId}/archive`, { archived: true }, token);
  record('POST chat archive', archive.status === 200 && archive.json.archived === true);

  // 21. Create story
  const story = await req('POST', '/api/stories', { media: 'https://example.com/a.jpg', type: 'image' }, token);
  record('POST /api/stories', story.status === 201 && !!story.json.story?.id, story.json.message || '');
  const storyId = story.json.story?.id;

  // 22. View own story
  const viewStory = await req('POST', '/api/stories/' + storyId + '/view', {}, token);
  record('POST story view', viewStory.status === 200);

  // 23. List stories
  const stories = await req('GET', '/api/stories', null, token);
  record('GET /api/stories', stories.status === 200 && Array.isArray(stories.json.tray));

  // 24. Notifications
  const notifs = await req('GET', '/api/notifications', null, token);
  record('GET /api/notifications', notifs.status === 200 && Array.isArray(notifs.json.notifications));
  const unread = await req('GET', '/api/notifications/unread-count', null, token);
  record('GET unread count', unread.status === 200 && typeof unread.json.unread === 'number');

  // 25. Presence + heartbeat
  const presence = await req('GET', '/api/users/presence', null, token);
  record('GET presence', presence.status === 200 && typeof presence.json.presence === 'object');
  const heartbeat = await req('POST', '/api/users/heartbeat', {}, token);
  record('POST heartbeat', heartbeat.status === 200);

  // 26. Register the second account used by the follow + friend flows.
  const suffix = Date.now();
  const reg2 = await req('POST', '/api/auth/register', {
    email: `smoke2${suffix}@test.dev`, password: 'secret123', username: `smoke2${suffix}`,
  });
  const token2 = reg2.json.accessToken;
  const whoUid = register.json.user.uid;
  record('POST /api/auth/register (second user)', reg2.status === 201 && !!token2, reg2.json.message || '');
  const otherUid = reg2.json.user?.uid;

  // 27. Follow / unfollow the other account (there are no seeded users).
  if (otherUid) {
    const found = await req('GET', `/api/users/search?q=smoke2${suffix}`, null, token);
    const followTarget = found.json.users?.find((u) => u.uid === otherUid);
    record('GET /api/users/search (finds second user)', Boolean(followTarget));
    const follow = await req('POST', `/api/friends/${otherUid}/follow`, {}, token);
    record('POST follow', follow.status === 200);
    const unfollow = await req('DELETE', `/api/friends/${otherUid}/follow`, {}, token);
    record('DELETE unfollow', unfollow.status === 200);
  } else {
    record('Follow flow', false, 'second register failed');
  }

  // 28. Friend request flow (two users)
  if (reg2.status === 201 && token2) {
    const sendFr = await req('POST', `/api/friends/request/${whoUid}`, {}, token2);
    record('POST friend request', sendFr.status === 201);
    const incoming = await req('GET', '/api/friends/requests', null, token);
    record('GET friend requests (as receiver)', incoming.status === 200 && incoming.json.requests?.length >= 1);
    const frId = incoming.json.requests?.[0]?.id;
    if (frId) {
      const acceptFr = await req('POST', `/api/friends/requests/${frId}/accept`, {}, token);
      record('POST accept friend request', acceptFr.status === 200 && !!acceptFr.json.chatId, acceptFr.json.message || '');
      const friends = await req('GET', '/api/friends', null, token);
      record('GET friends', friends.status === 200 && Array.isArray(friends.json.friends));
    }
  } else {
    record('Friend request flow', false, 'second register failed');
  }

  // 28. Direct chat + direct message between the two users
  if (reg2.status === 201 && token2) {
    const direct = await req('POST', `/api/chats/direct/${whoUid}`, {}, token2);
    record('POST direct chat', direct.status === 201 && !!direct.json.chat?.chatId, direct.json.message || '');
    const directChatId = direct.json.chat?.chatId;
    if (directChatId) {
      const dm = await req('POST', `/api/messages/${directChatId}/messages`, { text: 'Hey there!' }, token2);
      record('POST direct message', dm.status === 201);
      const read = await req('POST', `/api/messages/${directChatId}/read`, {}, token);
      record('POST direct chat read', read.status === 200);
    }
  } else {
    record('Direct chat flow', false, 'second register failed');
  }

  // 29. Settings
  const patchSettings = await req('PATCH', '/api/users/settings', { darkMode: 'dark', notifyMessages: false }, token);
  record('PATCH settings', patchSettings.status === 200 && patchSettings.json.settings?.darkMode === 'dark');

  // 30. Profile update
  const patchProfile = await req('PATCH', '/api/users/profile', { bio: 'I run smoke tests.' }, token);
  record('PATCH profile', patchProfile.status === 200 && patchProfile.json.user?.bio === 'I run smoke tests.');

  // 31. Delete a message (for_everyone)
  const delMe = await req('DELETE', `/api/messages/${groupId}/messages/${messageId}`, { mode: 'for_everyone' }, token);
  record('DELETE message for_everyone', delMe.status === 200);

  // 32. Logout
  const logout = await req('POST', '/api/auth/logout', { refreshToken }, token);
  record('POST logout', logout.status === 200);

  // 33. 2FA enable -> confirm -> disable
  const twofa = await req('POST', '/api/auth/2fa/enable', {}, token);
  record('POST 2fa/enable', twofa.status === 200 && !!twofa.json.secret, twofa.json.message || '');
  if (twofa.json.secret) {
    const { default: speakeasy } = await import('speakeasy');
    const code = speakeasy.totp({ secret: twofa.json.secret, encoding: 'base32' });
    const confirm2fa = await req('POST', '/api/auth/2fa/confirm', { code }, token);
    record('POST 2fa/confirm', confirm2fa.status === 200, confirm2fa.json.message || '');
    const disable2fa = await req('POST', '/api/auth/2fa/disable', { code }, token);
    record('POST 2fa/disable', disable2fa.status === 200, disable2fa.json.message || '');
  }

  // 34. Delete account
  const delAcc = await req('DELETE', '/api/auth/account', null, token2);
  record('DELETE account', delAcc.status === 200);

} catch (err) {
  record('UNCAUGHT', false, err.stack || String(err));
} finally {
  await close();
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
}

const failed = results.filter((r) => !r.ok);
console.log('----------------------------------------');
console.log(`SMOKE RESULT: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  failed.forEach((f) => console.log(`  FAILED: ${f.name}`));
}
process.exit(failed.length ? 1 : 0);