import { Lead } from '../../models/Lead.js';
import { Appointment } from '../../models/Appointment.js';
import { Property } from '../../models/Property.js';

const COMMISSION_RATE = 0.03;

export async function getDashboardStats(tenantId) {
  const [leads, appointments, properties] = await Promise.all([
    Lead.find({ tenantId }).lean(),
    Appointment.find({ tenantId }).lean(),
    Property.find({ tenantId }).lean(),
  ]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.toDateString();

  const stageCounts = { new: 0, qualified: 0, visit: 0, closed: 0, lost: 0 };
  const stageBudget = { new: 0, qualified: 0, visit: 0, closed: 0, lost: 0 };
  const sourceCount = { whatsapp: 0, instagram: 0, email: 0, manual: 0 };
  let totalScore = 0;
  let scoredLeads = 0;

  for (const lead of leads) {
    if (stageCounts[lead.stage] !== undefined) {
      stageCounts[lead.stage]++;
      stageBudget[lead.stage] += lead.budget || 0;
    }
    if (sourceCount[lead.source] !== undefined) sourceCount[lead.source]++;
    if (lead.score > 0) { totalScore += lead.score; scoredLeads++; }
  }

  const pipelineValue = stageBudget.new + stageBudget.qualified + stageBudget.visit;
  const closedRevenue = stageBudget.closed;
  const projectedCommission = closedRevenue * COMMISSION_RATE;
  const pipelineCommission = pipelineValue * COMMISSION_RATE * 0.4; // 40% weighted probability

  const apptsByMonth = appointments.filter(a => new Date(a.datetime) >= startOfMonth).length;
  const apptsByStatus = { scheduled: 0, confirmed: 0, cancelled: 0, done: 0 };
  for (const a of appointments) {
    if (apptsByStatus[a.status] !== undefined) apptsByStatus[a.status]++;
  }

  const todayAppts = appointments.filter(a => new Date(a.datetime).toDateString() === today).length;

  const topLeads = leads
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(l => ({ _id: l._id, name: l.name, score: l.score, stage: l.stage, predictedCloseProb: l.predictedCloseProb }));

  return {
    overview: {
      totalLeads: leads.length,
      totalProperties: properties.length,
      avgScore: scoredLeads ? Math.round(totalScore / scoredLeads) : 0,
      todayAppts,
    },
    pipeline: {
      stageCounts,
      stageBudget,
      pipelineValue,
      closedRevenue,
    },
    commissions: {
      earned: projectedCommission,
      projected: pipelineCommission,
      rate: COMMISSION_RATE,
    },
    sources: sourceCount,
    appointments: {
      thisMonth: apptsByMonth,
      byStatus: apptsByStatus,
    },
    topLeads,
  };
}
