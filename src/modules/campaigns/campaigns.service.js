import { AppError } from '../../utils/AppError.js';
import { Campaign } from '../../models/Campaign.js';
import { Lead } from '../../models/Lead.js';
import { Conversation } from '../../models/Conversation.js';
import { FunnelExecution } from '../../models/FunnelExecution.js';
import { sendWhatsAppMessage } from '../channels/whatsapp.service.js';
import { Tenant } from '../../models/Tenant.js';

export const list = (tenantId) =>
  Campaign.find({ tenantId }).sort({ createdAt: -1 });

export const getById = async (tenantId, id) => {
  const campaign = await Campaign.findOne({ _id: id, tenantId });
  if (!campaign) throw new AppError('Campaign not found', 404);
  return campaign;
};

export const create = (tenantId, data) =>
  Campaign.create({ ...data, tenantId });

export const update = async (tenantId, id, data) => {
  const campaign = await Campaign.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true,
    runValidators: true,
  });
  if (!campaign) throw new AppError('Campaign not found', 404);
  return campaign;
};

export const remove = async (tenantId, id) => {
  const campaign = await Campaign.findOneAndDelete({ _id: id, tenantId });
  if (!campaign) throw new AppError('Campaign not found', 404);
};

// Resolve which leads match the campaign filter and have a WhatsApp contact
async function resolveTargets(tenantId, filter) {
  const leadFilter = { tenantId };
  if (filter.stage) leadFilter.stage = filter.stage;
  if (filter.tag) leadFilter.tags = filter.tag;

  let leads = await Lead.find(leadFilter).lean();

  // Filter by funnel profile if specified
  if (filter.funnelProfile) {
    const executions = await FunnelExecution.find({
      tenantId,
      profile: { $regex: new RegExp(`^${filter.funnelProfile}$`, 'i') },
      status: 'completed',
    })
      .select('leadId')
      .lean();
    const profileLeadIds = new Set(executions.map((e) => e.leadId.toString()));
    leads = leads.filter((l) => profileLeadIds.has(l._id.toString()));
  }

  return leads;
}

export const send = async (tenantId, id) => {
  const campaign = await Campaign.findOne({ _id: id, tenantId });
  if (!campaign) throw new AppError('Campaign not found', 404);
  if (campaign.status === 'sent') throw new AppError('Campaign already sent', 400);

  const tenant = await Tenant.findById(tenantId);
  const phoneNumberId = tenant?.channels?.whatsappPhoneNumberId;
  if (!phoneNumberId) throw new AppError('WhatsApp not configured for this tenant', 400);

  const targets = await resolveTargets(tenantId, campaign.filter);
  campaign.targetCount = targets.length;
  campaign.status = 'sending';
  await campaign.save();

  let sentCount = 0;
  for (const lead of targets) {
    if (!lead.contact) continue;
    try {
      await sendWhatsAppMessage(phoneNumberId, lead.contact, campaign.message);
      // Store in conversation if one exists
      const conv = await Conversation.findOne({ tenantId, externalId: lead.contact });
      if (conv) {
        conv.messages.push({ role: 'assistant', content: campaign.message });
        conv.lastMessageAt = new Date();
        await conv.save();
      }
      sentCount++;
    } catch {
      // Continue sending to remaining leads even if one fails
    }
  }

  campaign.status = 'sent';
  campaign.sentCount = sentCount;
  campaign.sentAt = new Date();
  await campaign.save();

  return campaign;
};

export const previewTargets = async (tenantId, filter) => {
  const targets = await resolveTargets(tenantId, filter);
  return { count: targets.length, leads: targets.slice(0, 5).map((l) => ({ name: l.name, contact: l.contact, stage: l.stage })) };
};
