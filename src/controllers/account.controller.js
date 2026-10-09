import { getData, update, genId, now } from '../services/store.js';
import { ApiError } from '../middleware/error.js';
import { sendEmail } from '../services/mail.service.js';
import { config } from '../config.js';

export async function sendVerificationEmail(req, res) {
  const user = getData().users.find((u) => u.uid === req.userId);
  if (!user) throw new ApiError(404, 'User not found.');
  if (user.emailVerified) throw new ApiError(400, 'Email is already verified.');
  const code = Buffer.from(`${user.uid}.${user.email}`).toString('base64url');
  await sendEmail(user.email, 'Verify your ChatMate email',
    `Hello ${user.displayName},\n\nVerify your email by opening:\n${config.publicUrl}/verify-email?code=${code}\n\nThanks,\nChatMate Team`);
  res.json({ ok: true, message: 'Verification email sent.' });
}

export async function requestPasswordReset(req, res) {
  const { email } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const user = getData().users.find((u) => u.email?.toLowerCase() === cleanEmail);
  // Always ok so we don't reveal which emails are registered.
  if (!user?.email) return res.json({ ok: true, message: "If that email exists, you'll hear from us shortly." });
  const code = genId('reset');
  update((d) => {
    d.resetTokens = d.resetTokens.filter((t) => t.userId !== user.uid || t.used);
    d.resetTokens.push({
      id: genId('rt'), userId: user.uid, code,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      used: false, createdAt: now(),
    });
    return d;
  });
  await sendEmail(user.email, 'Reset your ChatMate password',
    `Hello ${user.displayName},\n\nUse this reset code:\n${code}\n\nIt expires in 30 minutes.\n\nThanks,\nChatMate Team`);
  res.json({ ok: true, message: "If that email exists, you'll hear from us shortly." });
}

export async function resetPassword(req, res) {
  const { code, email, newPassword } = req.body;
  const data = getData();
  const user = data.users.find((u) => u.email?.toLowerCase() === String(email || '').trim().toLowerCase());
  const token = user && data.resetTokens.find((t) => t.userId === user.uid && t.code === code && !t.used);
  if (!token || new Date(token.expiresAt) < new Date()) throw new ApiError(400, 'This reset code is invalid or has expired.');
  if (!newPassword || String(newPassword).length < 6) throw new ApiError(400, 'Password must be at least 6 characters long.');
  const bcrypt = await import('bcryptjs');
  update((d) => {
    d.users.find((x) => x.uid === user.uid).password = bcrypt.hashSync(newPassword, 10);
    d.resetTokens = d.resetTokens.map((t) => (t.id === token.id ? { ...t, used: true } : t));
    return d;
  });
  res.json({ ok: true, message: 'Your password has been reset. You can sign in now.' });
}

export function removeAccountData(d, uid) {
    d.users = d.users.filter((u) => u.uid !== uid);
    d.friends = d.friends.filter((f) => f.userId !== uid && f.friendId !== uid);
    d.friendRequests = d.friendRequests.filter((r) => r.senderId !== uid && r.receiverId !== uid);
    d.followers = d.followers.filter((f) => f.userId !== uid && f.followerId !== uid);
    d.following = d.following.filter((f) => f.userId !== uid && f.followingId !== uid);
    d.blocks = d.blocks.filter((b) => b.userId !== uid && b.blockedId !== uid);
    d.stories = d.stories.filter((s) => s.userId !== uid);
    d.highlights = d.highlights.filter((h) => h.userId !== uid);
    d.notifications = d.notifications.filter((n) => n.userId !== uid && n.actorId !== uid);
    d.refreshTokens = d.refreshTokens.filter((t) => t.userId !== uid);
    d.devices = d.devices.filter((dev) => dev.userId !== uid);
    delete d.settings[uid];
    const groupChatIds = d.chats.filter((c) => c.type === 'group').map((c) => c.chatId);
    d.chats = d.chats.filter((c) => {
      if (c.type === 'group') {
        c.participants = c.participants.filter((p) => p.uid !== uid);
        return c.participants.length > 0;
      }
      return !c.participants.some((p) => p.uid === uid);
    });
    d.messages = d.messages.filter((m) => d.chats.some((c) => c.chatId === m.chatId) || !groupChatIds.includes(m.chatId));
    return d;
}

export function deleteAccount(req, res) {
  const uid = req.userId;
  update((d) => {
    removeAccountData(d, uid);
    return d;
  });
  res.json({ ok: true, message: 'Account deleted.' });
}
