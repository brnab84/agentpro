import { env } from '../../config/env.js';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

export async function sendWhatsAppMessage(phoneNumberId, to, text) {
  const token = env.whatsappAccessToken;
  if (!token || !phoneNumberId) return; // silently skip if not configured

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[WhatsApp] send error:', err);
  }
}

// Parses Meta webhook payload and returns normalized messages array.
export function parseWhatsAppWebhook(body) {
  const results = [];
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      const messages = value.messages || [];
      for (const msg of messages) {
        if (msg.type !== 'text') continue;
        results.push({
          phoneNumberId,
          from: msg.from,
          name: value.contacts?.[0]?.profile?.name || msg.from,
          text: msg.text?.body || '',
          msgId: msg.id,
        });
      }
    }
  }
  return results;
}
