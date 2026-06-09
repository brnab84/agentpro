import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { handleIncomingMessage, resolveTenantByWhatsapp, resolveTenantByInstagram } from './channels.service.js';
import { parseWhatsAppWebhook, sendWhatsAppMessage } from './whatsapp.service.js';
import { parseInstagramWebhook, sendInstagramMessage } from './instagram.service.js';
import { findActiveByKeyword, findRunningExecution } from '../funnels/funnels.service.js';
import { startFunnelExecution, continueFunnelExecution } from '../funnels/execution.engine.js';

// ── WhatsApp ─────────────────────────────────────────────────────────────────

export const verifyWhatsApp = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsappVerifyToken) {
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Forbidden' });
};

export const receiveWhatsApp = asyncHandler(async (req, res) => {
  // Acknowledge immediately (Meta requires 200 within 20s)
  res.status(200).json({ status: 'ok' });

  console.log('[WA webhook]', JSON.stringify(req.body).slice(0, 300));
  const messages = parseWhatsAppWebhook(req.body);
  console.log('[WA parsed]', messages.length, 'messages');
  for (const msg of messages) {
    console.log('[WA msg] phoneNumberId:', msg.phoneNumberId, 'from:', msg.from);
    const tenant = await resolveTenantByWhatsapp(msg.phoneNumberId);
    console.log('[WA tenant]', tenant ? tenant._id : 'NOT FOUND');
    if (!tenant) continue;

    const sendPhoneNumberId = tenant.channels?.whatsappPhoneNumberId || msg.phoneNumberId;
    let reply;

    // Check for running funnel execution first
    const runningExec = await findRunningExecution(tenant._id, msg.from);
    if (runningExec) {
      reply = await continueFunnelExecution({ execution: runningExec, text: msg.text });
    } else {
      // Check if text matches a funnel keyword trigger
      const funnel = await findActiveByKeyword(tenant._id, msg.text?.trim());
      if (funnel) {
        reply = await startFunnelExecution({
          tenantId: tenant._id,
          funnel,
          externalId: msg.from,
          displayName: msg.name,
          channel: 'whatsapp',
          initialText: msg.text,
        });
      } else {
        reply = await handleIncomingMessage({
          tenantId: tenant._id,
          channel: 'whatsapp',
          externalId: msg.from,
          displayName: msg.name,
          text: msg.text,
        });
      }
    }

    if (reply) await sendWhatsAppMessage(sendPhoneNumberId, msg.from, reply);
  }
});

// ── Instagram ────────────────────────────────────────────────────────────────

export const verifyInstagram = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.instagramVerifyToken) {
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Forbidden' });
};

export const receiveInstagram = asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'ok' });

  const messages = parseInstagramWebhook(req.body);
  for (const msg of messages) {
    const tenant = await resolveTenantByInstagram(msg.pageId);
    if (!tenant) continue;

    const reply = await handleIncomingMessage({
      tenantId: tenant._id,
      channel: 'instagram',
      externalId: msg.senderId,
      displayName: msg.senderId,
      text: msg.text,
    });

    await sendInstagramMessage(msg.pageId, msg.senderId, reply);
  }
});

// ── Email (inbound via webhook, e.g. SendGrid Inbound Parse) ─────────────────

export const receiveEmail = asyncHandler(async (req, res) => {
  res.status(200).json({ status: 'ok' });

  // SendGrid Inbound Parse sends multipart/form-data
  const from = req.body.from || '';
  const subject = req.body.subject || '';
  const text = req.body.text || req.body.html || '';
  const to = req.body.to || '';

  // Extract tenantId from the "to" address: <tenantId>@inbound.agentpro.app
  const toMatch = to.match(/^([a-f0-9]{24})@/i);
  if (!toMatch) return;
  const tenantId = toMatch[1];

  // Extract sender email
  const emailMatch = from.match(/<(.+?)>/) || [null, from];
  const senderEmail = emailMatch[1].trim();
  const senderName = from.replace(/<.+>/, '').trim() || senderEmail;

  const fullText = subject ? `Asunto: ${subject}\n\n${text}` : text;

  await handleIncomingMessage({
    tenantId,
    channel: 'email',
    externalId: senderEmail,
    displayName: senderName,
    text: fullText,
  });
});

// ── Conversations (protected, for agents to read) ────────────────────────────

import { Conversation } from '../../models/Conversation.js';

export const getConversations = asyncHandler(async (req, res) => {
  const { tenantId } = req;
  const { leadId, channel } = req.query;
  const filter = { tenantId };
  if (leadId) filter.leadId = leadId;
  if (channel) filter.channel = channel;

  const convs = await Conversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .populate('leadId', 'name contact stage score');

  res.json(convs);
});

export const getConversation = asyncHandler(async (req, res) => {
  const conv = await Conversation.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate(
    'leadId',
    'name contact stage score',
  );
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json(conv);
});

export const replyToConversation = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const conv = await Conversation.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!conv) return res.status(404).json({ error: 'Not found' });

  conv.messages.push({ role: 'assistant', content: text });
  conv.lastMessageAt = new Date();
  await conv.save();

  if (conv.channel === 'whatsapp') {
    const { Tenant } = await import('../../models/Tenant.js');
    const tenant = await Tenant.findById(req.tenantId);
    const phoneNumberId = tenant?.channels?.whatsappPhoneNumberId;
    if (phoneNumberId) await sendWhatsAppMessage(phoneNumberId, conv.externalId, text);
  } else if (conv.channel === 'instagram') {
    await sendInstagramMessage(conv.externalId, conv.externalId, text);
  }

  res.json({ ok: true, message: conv.messages.at(-1) });
});

export const toggleConversationBot = asyncHandler(async (req, res) => {
  const conv = await Conversation.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!conv) return res.status(404).json({ error: 'Not found' });
  conv.botEnabled = !conv.botEnabled;
  await conv.save();
  res.json({ botEnabled: conv.botEnabled });
});
