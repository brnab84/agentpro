import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { getStats } from './analytics.controller.js';

const router = Router();

router.use(auth, tenantScope);
router.get('/', getStats);

export default router;
