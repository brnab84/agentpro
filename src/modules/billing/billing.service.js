import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { Tenant }   from '../../models/Tenant.js';
import { Settings } from '../../models/Settings.js';
import { AppError } from '../../utils/AppError.js';

// Lazily created Stripe client (only when a secret key is configured).
let _stripe = null;
function stripe() {
  if (!env.stripeSecretKey) throw new AppError('La facturación no está configurada', 503);
  if (!_stripe) _stripe = new Stripe(env.stripeSecretKey);
  return _stripe;
}

export function isEnabled() {
  return !!env.stripeSecretKey;
}

async function getPlan(planKey) {
  const settings = await Settings.getSingleton();
  return settings.plans.find(p => p.key === planKey);
}

/** Map a Stripe price id back to our plan key. */
async function planKeyForPrice(priceId) {
  const settings = await Settings.getSingleton();
  return settings.plans.find(p => p.stripePriceId === priceId)?.key || null;
}

/** Ensure the tenant has a Stripe customer; returns the customer id. */
async function ensureCustomer(tenant, ownerEmail) {
  if (tenant.billing?.stripeCustomerId) return tenant.billing.stripeCustomerId;
  const customer = await stripe().customers.create({
    name: tenant.name,
    email: ownerEmail || tenant.portal?.email || undefined,
    metadata: { tenantId: String(tenant._id) },
  });
  tenant.billing = { ...(tenant.billing || {}), stripeCustomerId: customer.id };
  await tenant.save();
  return customer.id;
}

/** Create a Checkout Session to subscribe a tenant to a paid plan. */
export async function createCheckoutSession(tenantId, planKey, ownerEmail, baseUrl) {
  if (planKey === 'free') throw new AppError('El plan Free no requiere pago', 400);
  const plan = await getPlan(planKey);
  if (!plan)               throw new AppError('Plan inválido', 400);
  if (!plan.stripePriceId) throw new AppError(`El plan ${plan.label || planKey} no tiene un Price de Stripe configurado`, 400);

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Cuenta no encontrada', 404);
  const customerId = await ensureCustomer(tenant, ownerEmail);

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/?billing=success`,
    cancel_url:  `${baseUrl}/?billing=cancel`,
    metadata: { tenantId: String(tenantId), planKey },
    subscription_data: { metadata: { tenantId: String(tenantId), planKey } },
  });
  return { url: session.url };
}

/** Create a Billing Portal session so the customer can manage their subscription. */
export async function createPortalSession(tenantId, baseUrl) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant?.billing?.stripeCustomerId) {
    throw new AppError('No hay una suscripción activa para gestionar', 400);
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: tenant.billing.stripeCustomerId,
    return_url: `${baseUrl}/`,
  });
  return { url: session.url };
}

/** Current billing status for the owner UI. */
export async function getStatus(tenantId) {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new AppError('Cuenta no encontrada', 404);
  const plan = await getPlan(tenant.plan || 'free');
  return {
    enabled: isEnabled(),
    plan: tenant.plan || 'free',
    planLabel: plan?.label || tenant.plan || 'Free',
    price: plan?.price || 0,
    currency: plan?.currency || 'USD',
    interval: plan?.interval || 'month',
    subscriptionStatus: tenant.billing?.subscriptionStatus || '',
    currentPeriodEnd: tenant.billing?.currentPeriodEnd || null,
    hasCustomer: !!tenant.billing?.stripeCustomerId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handling
// ─────────────────────────────────────────────────────────────────────────────

export function verifyWebhook(rawBody, signature) {
  if (!env.stripeWebhookSecret) throw new AppError('Webhook secret no configurado', 503);
  return stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}

async function applySubscription(sub) {
  const customerId = sub.customer;
  const tenant = await Tenant.findOne({ 'billing.stripeCustomerId': customerId });
  if (!tenant) return;

  const priceId = sub.items?.data?.[0]?.price?.id;
  const planKey = (await planKeyForPrice(priceId)) || sub.metadata?.planKey;
  const active = ['active', 'trialing'].includes(sub.status);

  tenant.billing = {
    ...(tenant.billing || {}),
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
  };
  // Downgrade to free when the subscription is no longer active.
  if (sub.status === 'canceled') tenant.plan = 'free';
  else if (active && planKey)    tenant.plan = planKey;
  await tenant.save();
}

/** Process a verified Stripe event. */
export async function handleEvent(event) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applySubscription(event.data.object);
      break;
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.subscription) {
        const sub = await stripe().subscriptions.retrieve(session.subscription);
        await applySubscription(sub);
      }
      break;
    }
    default:
      break; // ignore others
  }
}
