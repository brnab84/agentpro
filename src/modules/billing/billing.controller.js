import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import * as service from './billing.service.js';
import { getUsage } from './limits.service.js';

const baseUrlOf = (req) =>
  (env.appBaseUrl && env.appBaseUrl.replace(/\/$/, '')) || `${req.protocol}://${req.get('host')}`;

/** GET /api/billing/status — current plan + subscription + usage */
export const getStatus = asyncHandler(async (req, res) => {
  const [status, usage] = await Promise.all([
    service.getStatus(req.tenantId),
    getUsage(req.tenantId),
  ]);
  res.json({ ...status, usage });
});

/** POST /api/billing/checkout — start a subscription checkout */
export const checkout = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  res.json(await service.createCheckoutSession(req.tenantId, plan, req.user?.email, baseUrlOf(req)));
});

/** POST /api/billing/portal — open the Stripe billing portal */
export const portal = asyncHandler(async (req, res) => {
  res.json(await service.createPortalSession(req.tenantId, baseUrlOf(req)));
});

/** POST /api/billing/webhook — Stripe events (raw body, no auth) */
export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = service.verifyWebhook(req.body, signature);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  await service.handleEvent(event);
  res.json({ received: true });
});
