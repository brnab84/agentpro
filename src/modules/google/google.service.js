import { google } from 'googleapis';
import { env } from '../../config/env.js';
import { GoogleToken } from '../../models/GoogleToken.js';
import { AppError } from '../../utils/AppError.js';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth2 client factory
// ─────────────────────────────────────────────────────────────────────────────
const SCOPES_CALENDAR = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

const SCOPES_LOGIN = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function makeOAuth2Client() {
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar connection
// ─────────────────────────────────────────────────────────────────────────────
export function getCalendarAuthUrl(tenantId) {
  if (!env.googleClientId) throw new AppError('Google OAuth no está configurado', 503);
  const oauth2 = makeOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES_CALENDAR,
    state: tenantId.toString(),
  });
}

export async function handleCalendarCallback(code, tenantId) {
  const oauth2 = makeOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Get connected Google account email
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data: profile } = await oauth2Api.userinfo.get();

  await GoogleToken.findOneAndUpdate(
    { tenantId },
    {
      tenantId,
      email: profile.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
    },
    { upsert: true, new: true },
  );

  return profile.email;
}

export async function getConnectionStatus(tenantId) {
  const stored = await GoogleToken.findOne({ tenantId });
  return stored ? { connected: true, email: stored.email } : { connected: false };
}

export async function disconnect(tenantId) {
  await GoogleToken.deleteOne({ tenantId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar sync helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getAuthedCalendar(tenantId) {
  const stored = await GoogleToken.findOne({ tenantId });
  if (!stored) throw new AppError('Google Calendar no conectado', 400);

  const oauth2 = makeOAuth2Client();
  oauth2.setCredentials({
    access_token:  stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date:   stored.expiryDate,
  });

  // Auto-refresh token if expired
  oauth2.on('tokens', async updatedTokens => {
    if (updatedTokens.access_token) {
      stored.accessToken = updatedTokens.access_token;
      if (updatedTokens.expiry_date) stored.expiryDate = updatedTokens.expiry_date;
      await stored.save();
    }
  });

  return google.calendar({ version: 'v3', auth: oauth2 });
}

export async function syncAppointmentsToCalendar(tenantId, appointments) {
  const calendar = await getAuthedCalendar(tenantId);
  const results = [];

  for (const appt of appointments) {
    try {
      const startDt = new Date(appt.date);
      const endDt   = new Date(startDt.getTime() + 60 * 60 * 1000); // +1 hour default

      const event = {
        summary:     appt.title || 'Cita inmobiliaria',
        description: [
          appt.notes || '',
          appt.leadId?.name ? `Lead: ${appt.leadId.name}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: startDt.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
        end:   { dateTime: endDt.toISOString(),   timeZone: 'America/Argentina/Buenos_Aires' },
      };

      if (appt.googleEventId) {
        // Update existing event
        await calendar.events.update({ calendarId: 'primary', eventId: appt.googleEventId, requestBody: event });
        results.push({ apptId: appt._id, status: 'updated' });
      } else {
        // Create new event
        const { data } = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
        results.push({ apptId: appt._id, status: 'created', googleEventId: data.id });
      }
    } catch (err) {
      results.push({ apptId: appt._id, status: 'error', error: err.message });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Login (verify ID token issued by client-side Sign-In button)
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyGoogleIdToken(idToken) {
  if (!env.googleClientId) throw new AppError('Google OAuth no configurado', 503);
  const client = makeOAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId });
  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    email:    payload.email,
    name:     payload.name,
    picture:  payload.picture,
  };
}
