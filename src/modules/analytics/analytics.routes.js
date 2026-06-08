import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { getStats } from './analytics.controller.js';

const router = Router();

router.use(authenticate, tenantScope);
router.get('/', getStats);

export default router;
