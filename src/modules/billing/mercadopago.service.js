import { env } from '../../config/env.js';
import { Tenant }   from '../../models/Tenant.js';
import { Settings } from '../../models/Settings.js';
import { AppError } from '../../utils/AppError.js';

// MercadoPago subscriptions (preapproval) via REST API — no SDK needed.
const MP_API = 'https://api.mercadopago.com';

export function isEnabled() {
  return !!env.mpAccessToken;
}

async function mpFetch(path, options = {}) {
  const res = await fetch(`${MP_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.mpAccessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(`MercadoPago: ${data.message || res.statusText}`, 502);
  }
  return data;
}

async function getPlan(planKey) {
  const settings = await Settings.getSingleton();
  return settings.plans.find(p => p.key === planKey);
}

/** Create a MercadoPago subscription (preapproval) and return its init_point URL. */
export async function createSubscription(tenantId, planKey, ownerEmail, baseUrl) {
  if (!isEnabled()) throw new AppError('MercadoPago no está configurado', 503);
  if (planKey === 'free') throw new AppError('El plan Free no requiere pago', 400);

  const plan = await getPlan(planKey);
  if (!plan)        throw new AppError('Plan inválido', 400);
  if (!plan.price)  throw new AppError('El plan no tiene precio configurado', 400);
  if (!ownerEmail)  throw new AppError('Falta el email del titular para MercadoPago', 400);

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Cuenta no encontrada', 404);

  const body = {
    reason: `AgentPro ${plan.label || planKey}`,
    external_reference: `${tenantId}:${planKey}`,
    payer_email: ownerEmail,
    back_url: `${baseUrl}/?billing=success`,
    status: 'pending',
    auto_recurring: {
      frequency: 1,
      frequency_type: plan.interval === 'year' ? 'years' : 'months',
      transaction_amount: plan.price,
      currency_id: plan.currency || 'USD',
    },
  };

  const pre = await mpFetch('/preapproval', { method: 'POST', body: JSON.stringify(body) });
  return { url: pre.init_point || pre.sandbox_init_point };
}

/** Handle a MercadoPago webhook/IPN notification: re-fetch the preapproval and apply. */
export async function handleNotification({ type, topic, id, dataId }) {
  const kind = type || topic;
  const preapprovalId = dataId || id;
  if (kind !== 'preapproval' || !preapprovalId) return; // ignore other events

  const pre = await mpFetch(`/preapproval/${preapprovalId}`);
  const [tenantId, planKey] = String(pre.external_reference || '').split(':');
  if (!tenantId) return;

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return;

  tenant.billing = {
    ...(tenant.billing || {}),
    provider: 'mercadopago',
    mpPreapprovalId: preapprovalId,
    subscriptionStatus: pre.status,
  };
  // authorized = active subscription; cancelled/paused → downgrade
  if (pre.status === 'authorized' && planKey) tenant.plan = planKey;
  else if (['cancelled', 'paused'].includes(pre.status)) tenant.plan = 'free';
  await tenant.save();
}
