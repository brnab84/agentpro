import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import {
  verifyWhatsApp,
  receiveWhatsApp,
  verifyInstagram,
  receiveInstagram,
  receiveEmail,
  getConversations,
  getConversation,
  replyToConversation,
} from './channels.controller.js';

const router = Router();

// ── Public webhooks (no auth — verified by token or tenantId in address) ─────
router.get('/whatsapp', verifyWhatsApp);
router.post('/whatsapp', receiveWhatsApp);

router.get('/instagram', verifyInstagram);
router.post('/instagram', receiveInstagram);

router.post('/email', receiveEmail);

// ── Protected: agents reading conversations ───────────────────────────────────
router.use(auth, tenantScope);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.post('/conversations/:id/reply', replyToConversation);

export default router;
