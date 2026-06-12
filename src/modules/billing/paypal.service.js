import { env } from '../../config/env.js';
import { Tenant }   from '../../models/Tenant.js';
import { Settings } from '../../models/Settings.js';
import { AppError } from '../../utils/AppError.js';

// PayPal Subscriptions via REST API.
const BASE = () =>
  env.paypalEnv === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

export function isEnabled() {
  return !!(env.paypalClientId && env.paypalSecret);
}

/** Get an OAuth2 access token (client_credentials). */
async function getAccessToken() {
  const auth = Buffer.from(`${env.paypalClientId}:${env.paypalSecret}`).toString('base64');
  const res = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(`PayPal auth: ${data.error_description || res.statusText}`, 502);
  return data.access_token;
}

async function ppFetch(path, { method = 'GET', body, token } = {}) {
  const t = token || (await getAccessToken());
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(`PayPal: ${data.message || res.statusText}`, 502);
  return data;
}

async function getPlan(planKey) {
  const settings = await Settings.getSingleton();
  return settings.plans.find(p => p.key === planKey);
}

/** Create a PayPal subscription and return the approval URL. */
export async function createSubscription(tenantId, planKey, baseUrl) {
  if (!isEnabled()) throw new AppError('PayPal no está configurado', 503);
  if (planKey === 'free') throw new AppError('El plan Free no requiere pago', 400);

  const plan = await getPlan(planKey);
  if (!plan)              throw new AppError('Plan inválido', 400);
  if (!plan.paypalPlanId) throw new AppError(`El plan ${plan.label || planKey} no tiene un Plan ID de PayPal configurado`, 400);

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Cuenta no encontrada', 404);

  const sub = await ppFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: {
      plan_id: plan.paypalPlanId,
      custom_id: `${tenantId}:${planKey}`,
      application_context: {
        brand_name: 'AgentPro',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${baseUrl}/?billing=success`,
        cancel_url: `${baseUrl}/?billing=cancel`,
      },
    },
  });

  const approve = (sub.links || []).find(l => l.rel === 'approve');
  if (!approve) throw new AppError('PayPal no devolvió enlace de aprobación', 502);
  return { url: approve.href };
}

/** Apply a PayPal subscription state to the tenant (re-fetched for trust). */
async function applySubscription(subscriptionId) {
  const sub = await ppFetch(`/v1/billing/subscriptions/${subscriptionId}`);
  const [tenantId, planKey] = String(sub.custom_id || '').split(':');
  if (!tenantId) return;

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return;

  const active = sub.status === 'ACTIVE';
  tenant.billing = {
    ...(tenant.billing || {}),
    provider: 'paypal',
    paypalSubscriptionId: subscriptionId,
    subscriptionStatus: sub.status,
  };
  if (active && planKey) tenant.plan = planKey;
  else if (['CANCELLED', 'EXPIRED', 'SUSPENDED'].includes(sub.status)) tenant.plan = 'free';
  await tenant.save();
}

/**
 * Verify a PayPal webhook via PayPal's verify-webhook-signature API.
 * Returns true if no webhook id is configured (re-fetch by id already protects us).
 */
export async function verifyWebhook(headers, event) {
  if (!env.paypalWebhookId) return true;
  try {
    const data = await ppFetch('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: {
        auth_algo:         headers['paypal-auth-algo'],
        cert_url:          headers['paypal-cert-url'],
        transmission_id:   headers['paypal-transmission-id'],
        transmission_sig:  headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id:        env.paypalWebhookId,
        webhook_event:     event,
      },
    });
    return data.verification_status === 'SUCCESS';
  } catch { return false; }
}

/** Handle a PayPal webhook event. */
export async function handleWebhook(event) {
  const type = event?.event_type || '';
  const resource = event?.resource || {};
  // Subscription lifecycle events carry the subscription id in resource.id
  if (type.startsWith('BILLING.SUBSCRIPTION.') && resource.id) {
    await applySubscription(resource.id);
  }
}
