import { Tenant } from '../../models/Tenant.js';
import { Lead } from '../../models/Lead.js';
import { Conversation } from '../../models/Conversation.js';
import { generateChatbotReply } from '../ai/chatbot.service.js';
import { qualifyFromText } from '../ai/ai.service.js';

// Finds or creates a lead for an incoming channel message.
async function findOrCreateLead(tenantId, channel, externalId, displayName) {
  let conv = await Conversation.findOne({ tenantId, channel, externalId });
  if (conv) {
    const lead = await Lead.findById(conv.leadId);
    return { lead, conv, isNew: false };
  }

  const lead = await Lead.create({
    tenantId,
    name: displayName || externalId,
    contact: externalId,
    source: channel,
    stage: 'new',
  });

  conv = await Conversation.create({
    tenantId,
    leadId: lead._id,
    channel,
    externalId,
    messages: [],
  });

  return { lead, conv, isNew: true };
}

// Builds a single text blob from recent conversation messages for AI qualification.
function buildConversationText(messages) {
  return messages
    .slice(-20) // last 20 messages to keep prompt short
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Agente'}: ${m.content}`)
    .join('\n');
}

export async function handleIncomingMessage({ tenantId, channel, externalId, displayName, text }) {
  const { lead, conv } = await findOrCreateLead(tenantId, channel, externalId, displayName);

  // Store incoming message
  conv.messages.push({ role: 'user', content: text });
  conv.lastMessageAt = new Date();

  // Generate chatbot reply
  const reply = await generateChatbotReply(conv.messages.slice(0, -1), text);
  conv.messages.push({ role: 'assistant', content: reply });
  await conv.save();

  // Re-qualify lead from full conversation every 3 user messages to keep data fresh
  const userMsgCount = conv.messages.filter((m) => m.role === 'user').length;
  if (userMsgCount % 3 === 0) {
    const convoText = buildConversationText(conv.messages);
    await qualifyFromText(tenantId, lead._id.toString(), convoText).catch(() => {});
  }

  return reply;
}

const META_TEST_PHONE_ID = '123456123';

// Looks up tenantId by the Meta phone_number_id stored on Tenant.
export async function resolveTenantByWhatsapp(phoneNumberId) {
  // Meta's test panel always sends phoneNumberId '123456123' — fall back to first configured tenant
  if (phoneNumberId === META_TEST_PHONE_ID) {
    return Tenant.findOne({ 'channels.whatsappPhoneNumberId': { $exists: true, $ne: '' } });
  }
  return Tenant.findOne({ 'channels.whatsappPhoneNumberId': phoneNumberId });
}

// Looks up tenantId by the Meta instagram_page_id stored on Tenant.
export async function resolveTenantByInstagram(pageId) {
  const tenant = await Tenant.findOne({ 'channels.instagramPageId': pageId });
  return tenant;
}
