import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ask } from './assistant.service.js';

const router = Router();

// Authenticated help assistant (can also act on the tenant's leads via tools).
router.post('/ask', auth, tenantScope, aiLimiter, asyncHandler(async (req, res) => {
  res.json(await ask(req.body?.messages, { tenantId: req.tenantId }));
}));

export default router;
