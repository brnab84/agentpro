import { Lead } from '../../models/Lead.js';
import { Property } from '../../models/Property.js';
import { AppError } from '../../utils/AppError.js';
import { qualifyLeadText } from './qualification.service.js';
import { computeScore } from './scoring.service.js';
import { matchProperties } from './matching.service.js';
import { nextBestAction } from './nextAction.service.js';

async function loadLead(tenantId, leadId) {
  const lead = await Lead.findOne({ _id: leadId, tenantId });
  if (!lead) throw new AppError('Lead not found', 404);
  return lead;
}

// Recalcula score, probabilidad de cierre, matches y next-best-action.
async function enrich(tenantId, lead) {
  const properties = await Property.find({ tenantId, status: 'available' });
  const matches = matchProperties(lead, properties, 3);
  const { score, predictedCloseProb } = computeScore(lead);

  lead.score = score;
  lead.predictedCloseProb = predictedCloseProb;
  lead.nextAction = nextBestAction(lead, matches);
  await lead.save();

  return {
    lead,
    matches: matches.map((m) => ({
      propertyId: m.property._id,
      title: m.property.title,
      zone: m.property.zone,
      price: m.property.price,
      matchScore: m.matchScore,
    })),
  };
}

// Califica desde texto libre (conversación), guarda datos y enriquece.
export async function qualifyFromText(tenantId, leadId, conversationText) {
  const lead = await loadLead(tenantId, leadId);
  const ai = await qualifyLeadText(conversationText);

  if (ai.budget != null) lead.budget = ai.budget;
  if (ai.intent) lead.intent = ai.intent;
  if (ai.urgencyDays != null) lead.urgencyDays = ai.urgencyDays;
  lead.aiQualityScore = ai.qualityScore;
  lead.aiSummary = ai.summary;
  if (lead.stage === 'new') lead.stage = 'qualified';

  return enrich(tenantId, lead);
}

// Recalcula scoring/matches/next-action sin llamar a la IA (usa datos actuales).
export async function rescore(tenantId, leadId) {
  const lead = await loadLead(tenantId, leadId);
  return enrich(tenantId, lead);
}

// Solo devuelve matches sin persistir.
export async function getMatches(tenantId, leadId) {
  const lead = await loadLead(tenantId, leadId);
  const properties = await Property.find({ tenantId, status: 'available' });
  return matchProperties(lead, properties, 5).map((m) => ({
    propertyId: m.property._id,
    title: m.property.title,
    zone: m.property.zone,
    price: m.property.price,
    matchScore: m.matchScore,
  }));
}
