import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ask } from './assistant.service.js';

const router = Router();

// Authenticated help assistant.
router.post('/ask', auth, asyncHandler(async (req, res) => {
  res.json(await ask(req.body?.messages));
}));

export default router;
