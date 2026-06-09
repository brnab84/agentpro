/**
 * Email service — uses Resend (https://resend.com)
 * Free tier: 3 000 emails/month, no credit card required
 * Setup: set RESEND_API_KEY in .env and RESEND_FROM_EMAIL (e.g. "AgentPro <no-reply@yourdomain.com>")
 */
import { Resend } from 'resend';
import { env } from '../config/env.js';

let _client = null;

function getClient() {
  if (!env.resendApiKey) throw new Error('RESEND_API_KEY not configured');
  if (!_client) _client = new Resend(env.resendApiKey);
  return _client;
}

/**
 * Send a transactional email.
 * @param {object} opts
 * @param {string|string[]} opts.to      Recipient(s)
 * @param {string}          opts.subject Email subject
 * @param {string}          opts.html    HTML body
 * @param {string}          [opts.text]  Plain-text fallback
 * @param {string}          [opts.from]  Override sender (defaults to env.resendFromEmail)
 */
export async function sendEmail({ to, subject, html, text, from }) {
  const client = getClient();
  const fromAddress = from || env.resendFromEmail || 'AgentPro <no-reply@agentpro.app>';

  const { data, error } = await client.emails.send({
    from:    fromAddress,
    to:      Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}

/** Convenience: send a plain-text notification */
export async function sendNotification(to, subject, message) {
  return sendEmail({
    to,
    subject,
    html: `<p style="font-family:sans-serif;font-size:14px;color:#374151">${message.replace(/\n/g, '<br>')}</p>`,
    text: message,
  });
}
