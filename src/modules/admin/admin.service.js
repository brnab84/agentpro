import { Tenant }   from '../../models/Tenant.js';
import { User }     from '../../models/User.js';
import { Property } from '../../models/Property.js';
import { Lead }     from '../../models/Lead.js';
import { AppError } from '../../utils/AppError.js';

// Reference pricing (USD/month) — used to estimate MRR before real billing exists.
export const PLAN_PRICES = { free: 0, pro: 29, business: 79 };
const VALID_PLANS  = Object.keys(PLAN_PRICES);
const VALID_STATUS = ['active', 'suspended'];

function monthKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/** Global KPIs for the admin dashboard. */
export async function getOverview() {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    tenants, totalUsers, totalProperties, totalLeads, activeUsers30d, planAgg,
  ] = await Promise.all([
    Tenant.find().select('plan status createdAt').lean(),
    User.countDocuments(),
    Property.countDocuments(),
    Lead.countDocuments(),
    User.countDocuments({ lastLoginAt: { $gte: since30 } }),
    Tenant.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
  ]);

  // Plan distribution + estimated MRR
  const planDistribution = { free: 0, pro: 0, business: 0 };
  for (const row of planAgg) if (row._id in planDistribution) planDistribution[row._id] = row.count;
  const estimatedMrr =
    planDistribution.pro * PLAN_PRICES.pro + planDistribution.business * PLAN_PRICES.business;

  // Signups by month (last 6 months)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), count: 0 });
  }
  const monthIndex = Object.fromEntries(months.map((m, i) => [m.key, i]));
  for (const t of tenants) {
    const k = monthKey(t.createdAt);
    if (k in monthIndex) months[monthIndex[k]].count++;
  }

  return {
    totals: {
      tenants: tenants.length,
      users: totalUsers,
      properties: totalProperties,
      leads: totalLeads,
      activeUsers30d,
      suspended: tenants.filter(t => t.status === 'suspended').length,
    },
    planDistribution,
    estimatedMrr,
    estimatedArr: estimatedMrr * 12,
    signupsByMonth: months,
  };
}

/** Per-account table with usage counts and owner/login info. */
export async function listTenants() {
  const [tenants, userAgg, propAgg, leadAgg, owners] = await Promise.all([
    Tenant.find().sort({ createdAt: -1 }).lean(),
    User.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 }, lastLogin: { $max: '$lastLoginAt' }, logins: { $sum: '$loginCount' } } }]),
    Property.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
    Lead.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
    User.find({ role: 'owner' }).select('tenantId email name').lean(),
  ]);

  const byTenant = (agg) => Object.fromEntries(agg.map(r => [String(r._id), r]));
  const u = byTenant(userAgg), p = byTenant(propAgg), l = byTenant(leadAgg);
  const ownerByTenant = Object.fromEntries(owners.map(o => [String(o.tenantId), o]));

  return tenants.map(t => {
    const id = String(t._id);
    const owner = ownerByTenant[id];
    return {
      id,
      name: t.name,
      plan: t.plan || 'free',
      status: t.status || 'active',
      createdAt: t.createdAt,
      ownerName: owner?.name || '—',
      ownerEmail: owner?.email || '—',
      users: u[id]?.count || 0,
      properties: p[id]?.count || 0,
      leads: l[id]?.count || 0,
      logins: u[id]?.logins || 0,
      lastLogin: u[id]?.lastLogin || null,
      portalActive: !!t.portal?.active,
      portalSlug: t.slug || '',
      mrr: PLAN_PRICES[t.plan || 'free'] || 0,
    };
  });
}

/** Update a tenant's plan and/or status (manual management). */
export async function updateTenant(tenantId, { plan, status }) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Cuenta no encontrada', 404);

  if (plan !== undefined) {
    if (!VALID_PLANS.includes(plan)) throw new AppError('Plan inválido', 400);
    tenant.plan = plan;
  }
  if (status !== undefined) {
    if (!VALID_STATUS.includes(status)) throw new AppError('Estado inválido', 400);
    tenant.status = status;
  }
  await tenant.save();
  return { id: String(tenant._id), plan: tenant.plan, status: tenant.status };
}
