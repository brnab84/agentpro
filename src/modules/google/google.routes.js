import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import * as controller from './google.controller.js';

const router = Router();

// Public callback — Google redirects here after consent (no auth middleware)
router.get('/callback', controller.handleCallback);

// Protected routes
router.use(auth, tenantScope);
router.get('/auth-url',    controller.getAuthUrl);
router.get('/status',      controller.getStatus);
router.delete('/disconnect', controller.disconnectCalendar);
router.post('/sync',       controller.syncCalendar);

export default router;
