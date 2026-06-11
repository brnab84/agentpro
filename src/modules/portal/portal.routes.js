import { Router } from 'express';
import { auth }        from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import * as controller from './portal.controller.js';

const router = Router();

// ── CRM / authenticated (must be before /:slug wildcard) ────────────────────
router.get   ('/config/me',                     auth, tenantScope, controller.getConfig);
router.put   ('/config/me',                     auth, tenantScope, controller.saveConfig);
router.patch ('/config/properties/:id/publish', auth, tenantScope, controller.togglePublish);

// ── Public (no auth) ─────────────────────────────────────────────────────────
router.get ('/:slug',              controller.getListing);
router.get ('/:slug/property/:id', controller.getProperty);
router.post('/:slug/contact',      controller.submitContact);
router.post('/:slug/assistant',    controller.assistantAsk);

export default router;
