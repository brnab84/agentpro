import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import * as controller from './auth.controller.js';
import { googleLogin } from '../google/google.controller.js';

const router = Router();

router.post('/register', validate(registerSchema), controller.register);
router.post('/login',    validate(loginSchema),    controller.login);
router.post('/google',   googleLogin); // Sign in / register with Google ID token

export default router;
