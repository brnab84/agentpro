import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { getStats } from './analytics.controller.js';

const router = Router();

router.use(authenticate, resolveTenant);
router.get('/', getStats);

export default router;
