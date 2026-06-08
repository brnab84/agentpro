import { env } from '../../config/env.js';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

export async function sendInstagramMessage(pageId, recipientId, text) {
  const token = env.instagramAccessToken;
  if (!token || !pageId) return; // silently skip if not configured

  const res = await fetch(`${GRAPH_URL}/${pageId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Instagram] send error:', err);
  }
}

// Parses Meta webhook payload for Instagram DMs.
export function parseInstagramWebhook(body) {
  const results = [];
  const entries = body.entry || [];
  for (const entry of entries) {
    const pageId = entry.id;
    const messagingEvents = entry.messaging || [];
    for (const event of messagingEvents) {
      if (!event.message?.text) continue;
      results.push({
        pageId,
        senderId: event.sender?.id,
        text: event.message.text,
        msgId: event.message.mid,
      });
    }
  }
  return results;
}
