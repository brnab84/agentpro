import { getAnthropic } from '../../config/anthropic.js';
import { env } from '../../config/env.js';
import { Funnel } from '../../models/Funnel.js';
import { FunnelExecution } from '../../models/FunnelExecution.js';
import { Conversation } from '../../models/Conversation.js';
import { Lead } from '../../models/Lead.js';

const PROFILE_TAG = '[PROFILE:';

function buildSystemPrompt(funnel) {
  const profileList = funnel.profiles
    .map((p) => `- ${p.name}${p.description ? ': ' + p.description : ''}`)
    .join('\n');

  let questionsSection = '';
  if (funnel.questions?.length > 0) {
    const qList = funnel.questions
      .map((q, i) => {
        let line = `${i + 1}. ${q.text}`;
        if (q.options?.length) line += `\n   Opciones: ${q.options.join(' / ')}`;
        return line;
      })
      .join('\n');
    questionsSection = `\nPREGUNTAS QUE DEBES HACER (en orden, una por mensaje):
${qList}

- Guía al lead hacia una de las opciones cuando existan. No inventes opciones.
- Una vez respondidas las preguntas obligatorias, clasificá al lead.`;
  }

  // Context files injected as reference docs
  let docsSection = '';
  if (funnel.contextFiles?.length > 0) {
    const docs = funnel.contextFiles
      .filter((f) => f.text?.trim())
      .map((f) => `=== ${f.name} ===\n${f.text}`)
      .join('\n\n');
    if (docs) docsSection = `\n\nDOCUMENTOS DE REFERENCIA (usá esta información para responder consultas):\n${docs}`;
  }

  // Custom prompt overrides the base role description
  const roleBase = funnel.customPrompt?.trim()
    ? funnel.customPrompt.trim()
    : `Eres un asistente de ventas inmobiliario experto. Tu misión es calificar al prospecto con preguntas naturales y breves.`;

  return `${roleBase}

CONTEXTO DEL PROYECTO:
${funnel.context || 'Proyecto inmobiliario de alta calidad.'}

PERFILES DE CLASIFICACIÓN:
${profileList}
${questionsSection}${docsSection}

REGLAS:
- Respondé en el mismo idioma que el cliente (español por defecto).
- Hacé UNA sola pregunta por mensaje. Sé conciso y amigable.
- Cuando tengas suficiente información, terminá tu respuesta con exactamente: [PROFILE:NombreDePerfil]
- El nombre del perfil debe ser EXACTAMENTE uno de la lista. Nunca inventes perfiles.
- ${funnel.requireEmail ? 'Antes de finalizar, solicitá el correo del cliente.' : ''}`;
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

// Execute synchronous flow steps (message, move_stage, add_tag, wait-skip).
// Returns { messages: string[], nextStepIndex: number }
// Stops before a 'profiling' step (stopAtProfiling=true).
async function runSyncFlowSteps(flow, fromIndex, lead, conv, stopAtProfiling = true) {
  const messages = [];
  let i = fromIndex;

  for (; i < flow.length; i++) {
    const step = flow[i];

    if (step.type === 'profiling' && stopAtProfiling) break;

    if (step.type === 'message' && step.text?.trim()) {
      conv.messages.push({ role: 'assistant', content: step.text });
      conv.lastMessageAt = new Date();
      messages.push(step.text);

    } else if (step.type === 'move_stage' && step.stage) {
      await Lead.findOneAndUpdate({ _id: lead._id }, { stage: step.stage });

    } else if (step.type === 'add_tag' && step.tag) {
      await Lead.findOneAndUpdate({ _id: lead._id }, { $addToSet: { tags: step.tag } });

    } else if (step.type === 'wait') {
      // wait is async/timer — skip in engine v1, handled externally
    }
  }

  if (messages.length) await conv.save();
  return { messages, nextStepIndex: i };
}

async function applyProfileActions(funnel, profileName, tenantId, leadId) {
  const path = funnel.profiles.find((p) => p.name.toLowerCase() === profileName.toLowerCase());
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
    flowStepIndex: 0,
  });

  await Funnel.findByIdAndUpdate(funnel._id, { $inc: { totalExecutions: 1 } });

  const flow = funnel.flow || [];
  const hasProfiling = flow.some((s) => s.type === 'profiling');

  // Run pre-profiling sync steps
  const { messages: preMessages, nextStepIndex } = await runSyncFlowSteps(flow, 0, lead, conv, true);
  await FunnelExecution.findByIdAndUpdate(execution._id, { flowStepIndex: nextStepIndex });

  // Run profiling AI (if flow has a profiling block OR no flow defined)
  const currentStep = flow[nextStepIndex];
  const shouldProfile = !hasProfiling || currentStep?.type === 'profiling';

  if (shouldProfile) {
    const aiReply = await continueProfilingConversation(funnel, conv, lead, execution, initialText);
    return [...preMessages, aiReply].filter(Boolean).join('\n\n') || aiReply;
  }

  // No profiling step — run remaining sync steps and complete
  const { messages: postMessages } = await runSyncFlowSteps(flow, nextStepIndex, lead, conv, false);
  await FunnelExecution.findByIdAndUpdate(execution._id, { status: 'completed', phase: 'done', completedAt: new Date() });
  await Funnel.findByIdAndUpdate(funnel._id, { $inc: { completedExecutions: 1 } });

  return [...preMessages, ...postMessages].join('\n\n') || null;
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

  const profileIdx = replyText.indexOf(PROFILE_TAG);
  if (profileIdx !== -1) {
    const profileEnd = replyText.indexOf(']', profileIdx);
    const profileName = replyText.slice(profileIdx + PROFILE_TAG.length, profileEnd).trim();

    replyText = replyText.slice(0, profileIdx).trim();

    conv.messages.push({ role: 'assistant', content: replyText });
    await conv.save();

    const pathProfile = funnel.profiles.find((p) => p.name.toLowerCase() === profileName.toLowerCase());
    if (pathProfile?.message) {
      conv.messages.push({ role: 'assistant', content: pathProfile.message });
      conv.lastMessageAt = new Date();
      await conv.save();
    }

    // Advance past profiling step in flow and run post-profiling sync steps
    const flow = funnel.flow || [];
    const profilingIdx = flow.findIndex((s) => s.type === 'profiling');
    const afterProfiling = profilingIdx >= 0 ? profilingIdx + 1 : flow.length;
    const { messages: postMessages } = await runSyncFlowSteps(flow, afterProfiling, lead, conv, false);

    await FunnelExecution.findByIdAndUpdate(execution._id, {
      status: 'completed',
      phase: 'done',
      profile: profileName,
      completedAt: new Date(),
      flowStepIndex: flow.length,
    });

    await Funnel.findByIdAndUpdate(funnel._id, { $inc: { completedExecutions: 1 } });
    await applyProfileActions(funnel, profileName, execution.tenantId, execution.leadId);

    const allMessages = [replyText, pathProfile?.message, ...postMessages].filter(Boolean);
    return allMessages.join('\n\n');
  }

  conv.messages.push({ role: 'assistant', content: replyText });
  await conv.save();
  return replyText;
}
