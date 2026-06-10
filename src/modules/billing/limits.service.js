import { Tenant }   from '../../models/Tenant.js';
import { Settings } from '../../models/Settings.js';
import { Property } from '../../models/Property.js';
import { User }     from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plan-limit enforcement. Limits live in the configurable Settings doc, so the
// admin can tune them. A limit of -1 (or missing) means unlimited.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the plan definition (with limits) for a tenant's current plan. */
async function getPlanFor(tenantId) {
  const tenant = await Tenant.findById(tenantId).select('plan').lean();
  const settings = await Settings.getSingleton();
  const planKey = tenant?.plan || 'free';
  const plan = settings.plans.find(p => p.key === planKey) || { key: planKey };
  return { planKey, plan };
}

function isUnlimited(limit) {
  return limit === undefined || limit === null || limit < 0;
}

/** Throw a 402 (payment required) when a tenant is at/over a plan limit. */
export async function assertCanAddProperty(tenantId) {
  const { plan } = await getPlanFor(tenantId);
  if (isUnlimited(plan.maxProperties)) return;
  const count = await Property.countDocuments({ tenantId });
  if (count >= plan.maxProperties) {
    throw new AppError(
      `Alcanzaste el límite de ${plan.maxProperties} propiedades de tu plan ${plan.label || plan.key}. Actualizá tu plan para agregar más.`,
      402,
    );
  }
}

/** Throw a 402 when a tenant is at/over the agent (user) limit. */
export async function assertCanAddAgent(tenantId) {
  const { plan } = await getPlanFor(tenantId);
  if (isUnlimited(plan.maxAgents)) return;
  const count = await User.countDocuments({ tenantId });
  if (count >= plan.maxAgents) {
    throw new AppError(
      `Alcanzaste el límite de ${plan.maxAgents} usuario(s) de tu plan ${plan.label || plan.key}. Actualizá tu plan para sumar agentes.`,
      402,
    );
  }
}

/** Current usage vs limits — for showing meters in the UI. */
export async function getUsage(tenantId) {
  const { planKey, plan } = await getPlanFor(tenantId);
  const [properties, users] = await Promise.all([
    Property.countDocuments({ tenantId }),
    User.countDocuments({ tenantId }),
  ]);
  return {
    plan: planKey,
    properties: { used: properties, limit: plan.maxProperties ?? -1 },
    agents:     { used: users,      limit: plan.maxAgents ?? -1 },
  };
}
