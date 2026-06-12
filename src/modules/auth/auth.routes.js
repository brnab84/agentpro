import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import * as controller from './auth.controller.js';
import { googleLogin } from '../google/google.controller.js';
import { auth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), controller.register);
router.post('/login',    authLimiter, validate(loginSchema),    controller.login);
router.post('/google',   authLimiter, googleLogin); // Sign in / register with Google ID token
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.post('/reset-password',  authLimiter, controller.resetPassword);
router.post('/recover',          authLimiter, controller.recover);
router.post('/recover-accounts', authLimiter, controller.recoverAccounts);
router.get ('/me',       auth, controller.me);

export default router;
