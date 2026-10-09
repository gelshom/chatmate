import { Router } from 'express';
import { register, login, verifyTwoFactor, verifyEmail } from '../controllers/auth.controller.js';
import { googleAuth } from '../controllers/oauth.controller.js';
import { refresh, me, logout, logoutEverywhere, revokeDevice } from '../controllers/session.controller.js';
import { changePassword, enableTwoFactor, confirmTwoFactor, disableTwoFactor } from '../controllers/security.controller.js';
import { sendVerificationEmail, requestPasswordReset, resetPassword, deleteAccount } from '../controllers/account.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// Public auth endpoints (rate-limited).
router.post('/register', authLimiter, validate({ body: { email: { required: true }, password: { required: true, min: 6 }, username: { required: true } } }), asyncHandler(register));
router.post('/login', authLimiter, validate({ body: { identifier: { required: true }, password: { required: true } } }), asyncHandler(login));
router.post('/2fa/verify', authLimiter, validate({ body: { userId: { required: true }, code: { required: true } } }), asyncHandler(verifyTwoFactor));
router.post('/google', authLimiter, asyncHandler(googleAuth));
router.post('/refresh', asyncHandler(refresh));
router.post('/forgot-password', authLimiter, validate({ body: { email: { required: true } } }), asyncHandler(requestPasswordReset));
router.post('/reset-password', authLimiter, validate({ body: { code: { required: true }, email: { required: true }, newPassword: { required: true, min: 6 } } }), asyncHandler(resetPassword));
router.get('/verify-email', asyncHandler(verifyEmail));

// Authenticated account endpoints.
router.get('/me', requireAuth, asyncHandler(me));
router.delete('/account', requireAuth, asyncHandler(deleteAccount));
router.post('/logout', requireAuth, asyncHandler(logout));
router.post('/logout-everywhere', requireAuth, asyncHandler(logoutEverywhere));
router.delete('/devices/:deviceId', requireAuth, asyncHandler(revokeDevice));
router.post('/change-password', requireAuth, validate({ body: { currentPassword: { required: true }, newPassword: { required: true, min: 6 } } }), asyncHandler(changePassword));
router.post('/2fa/enable', requireAuth, asyncHandler(enableTwoFactor));
router.post('/2fa/confirm', requireAuth, validate({ body: { code: { required: true } } }), asyncHandler(confirmTwoFactor));
router.post('/2fa/disable', requireAuth, validate({ body: { code: { required: true } } }), asyncHandler(disableTwoFactor));
router.post('/send-verification-email', requireAuth, asyncHandler(sendVerificationEmail));

export default router;
