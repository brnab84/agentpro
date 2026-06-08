import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { Funnel } from '../../models/Funnel.js';
import { FunnelExecution } from '../../models/FunnelExecution.js';
import { Conversation } from '../../models/Conversation.js';
import { Lead } from '../../models/Lead.js';

const PROFILE_TAG = '[PROFILE:';

function buildSystemPrompt(funnel) {
  const profileList = funnel.profiles.map((p) => `- ${p.name}${p.description ? ': ' + p.description : ''}`).join('\n');
  return `Eres un asistente de ventas inmobiliario experto. Tu misión es calificar al prospecto en una conversación natural y breve.

CONTEXTO DEL PROYECTO:
${funnel.context || 'Proyecto inmobiliario de alta calidad.'}

PERFILES DE CLASIFICACIÓN:
${profileList}

INSTRUCCIONES:
- Responde en el mismo idioma que el cliente (español por defecto).
- Haz máximo UNA pregunta por mensaje. Sé conciso y amigable.
- Obtén: presupuesto, intención (comprar/invertir), urgencia y zona de interés.
- Cuando tengas suficiente información para clasificar al lead, termina tu respuesta con exactamente: [PROFILE:NombreDePerfil]
- El nombre del perfil debe ser EXACTAMENTE uno de la lista de perfiles.
- Nunca inventes perfiles fuera de la lista.
- ${funnel.requireEmail ? 'Antes de finalizar, solicita el correo del cliente.' : ''}`;
}

async function findOrCreateLead(tenantId, channel, externalId, displayName) {
  let conv = await Conversation.findOne({ tenantId, channel, externalId });
  if (conv) {
    const lead = await Lead.findById(conv.leadId);
    return { lead, conv };
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

  return { lead, conv };
}

async function executeProfilePath(funnel, profile, tenantId, leadId) {
  const path = funnel.profiles.find((p) => p.name.toLowerCase() === profile.toLowerCase());
  if (!path) return;

  const updates = {};
  if (path.stage) updates.stage = path.stage;
  if (path.tag) updates[`tags`] = path.tag;
  if (Object.keys(updates).length) {
    await Lead.findOneAndUpdate({ _id: leadId, tenantId }, updates);
  }
}

export async function startFunnelExecution({ tenantId, funnel, externalId, displayName, channel, initialText }) {
  const { lead, conv } = await findOrCreateLead(tenantId, channel, externalId, displayName);

  const execution = await FunnelExecution.create({
    tenantId,
    funnelId: funnel._id,
    leadId: lead._id,
    conversationId: conv._id,
    externalId,
    channel,
    status: 'running',
    phase: 'profiling',
  });

  await Funnel.findByIdAndUpdate(funnel._id, { $inc: { totalExecutions: 1 } });

  const reply = await continueProfilingConversation(funnel, conv, lead, execution, initialText);
  return reply;
}

export async function continueFunnelExecution({ execution, text }) {
  const funnel = execution.funnelId;
  const conv = await Conversation.findById(execution.conversationId);
  const lead = await Lead.findById(execution.leadId);
  if (!conv || !lead) return null;

  return continueProfilingConversation(funnel, conv, lead, execution, text);
}

async function continueProfilingConversation(funnel, conv, lead, execution, userText) {
  conv.messages.push({ role: 'user', content: userText });
  conv.lastMessageAt = new Date();

  const client = getAnthropic();
  const response = await client.messages.create({
    model: env.aiModel,
    max_tokens: 500,
    system: buildSystemPrompt(funnel),
    messages: conv.messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  });

  let replyText = response.content[0].text;

  // Check if AI assigned a profile
  const profileIdx = replyText.indexOf(PROFILE_TAG);
  if (profileIdx !== -1) {
    const profileEnd = replyText.indexOf(']', profileIdx);
    const profileName = replyText.slice(profileIdx + PROFILE_TAG.length, profileEnd).trim();

    // Clean tag from reply
    replyText = replyText.slice(0, profileIdx).trim();

    // Store profile reply as assistant message
    conv.messages.push({ role: 'assistant', content: replyText });
    await conv.save();

    // Send profile-specific message
    const pathProfile = funnel.profiles.find((p) => p.name.toLowerCase() === profileName.toLowerCase());
    if (pathProfile?.message) {
      conv.messages.push({ role: 'assistant', content: pathProfile.message });
      conv.lastMessageAt = new Date();
      await conv.save();
    }

    // Update execution
    await FunnelExecution.findByIdAndUpdate(execution._id, {
      status: 'completed',
      phase: 'done',
      profile: profileName,
      completedAt: new Date(),
    });

    await Funnel.findByIdAndUpdate(funnel._id, { $inc: { completedExecutions: 1 } });

    // Move lead to stage / update CRM
    await executeProfilePath(funnel, profileName, execution.tenantId, execution.leadId);

    // Return both replies so the channel can send them sequentially
    return pathProfile?.message
      ? `${replyText}\n\n${pathProfile.message}`
      : replyText;
  }

  conv.messages.push({ role: 'assistant', content: replyText });
  await conv.save();
  return replyText;
}
