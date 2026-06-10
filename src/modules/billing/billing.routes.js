import { Router } from 'express';
import { auth }        from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenant.js';
import * as controller from './billing.controller.js';

const router = Router();

// Authenticated (tenant) endpoints. The webhook is mounted separately in app.js
// because it needs the raw request body for signature verification.
router.get ('/status',   auth, tenantScope, controller.getStatus);
router.post('/checkout', auth, tenantScope, controller.checkout);
router.post('/portal',   auth, tenantScope, controller.portal);
router.post('/mercadopago/checkout', auth, tenantScope, controller.mercadopagoCheckout);
router.post('/paypal/checkout',      auth, tenantScope, controller.paypalCheckout);

// Public webhooks (no auth)
router.post('/mercadopago/webhook', controller.mercadopagoWebhook);
router.get ('/mercadopago/webhook', controller.mercadopagoWebhook);
router.post('/paypal/webhook',      controller.paypalWebhook);

export default router;
