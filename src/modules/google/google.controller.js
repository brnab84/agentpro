import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import * as service from './google.service.js';
import * as apptService from '../appointments/appointments.service.js';

// GET /api/google/auth-url  — redirect user to Google consent screen
export const getAuthUrl = asyncHandler(async (req, res) => {
  const url = service.getCalendarAuthUrl(req.tenantId);
  res.json({ url });
});

// GET /api/google/callback?code=...&state=tenantId  — OAuth2 callback
export const handleCallback = asyncHandler(async (req, res) => {
  const { code, state: tenantId, error } = req.query;
  if (error) throw new AppError(`Google rechazó el acceso: ${error}`, 400);
  if (!code)  throw new AppError('Código de autorización no recibido', 400);

  const email = await service.handleCalendarCallback(code, tenantId);

  // Redirect back to app with success message
  res.redirect(`${env.appBaseUrl || '/'}?gcal=ok&email=${encodeURIComponent(email)}`);
});

// GET /api/google/status  — check if tenant has Google Calendar connected
export const getStatus = asyncHandler(async (req, res) => {
  res.json(await service.getConnectionStatus(req.tenantId));
});

// DELETE /api/google/disconnect
export const disconnectCalendar = asyncHandler(async (req, res) => {
  await service.disconnect(req.tenantId);
  res.json({ ok: true });
});

// POST /api/google/sync  — sync upcoming appointments to Google Calendar
export const syncCalendar = asyncHandler(async (req, res) => {
  const appointments = await apptService.listUpcoming(req.tenantId);
  if (!appointments.length) return res.json({ synced: 0, results: [] });

  const results = await service.syncAppointmentsToCalendar(req.tenantId, appointments);
  const synced = results.filter(r => r.status !== 'error').length;
  res.json({ synced, total: appointments.length, results });
});

// POST /api/auth/google  — Sign in / register with Google ID token
export const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) throw new AppError('idToken requerido', 400);

  const profile = await service.verifyGoogleIdToken(idToken);
  const { User }   = await import('../../models/User.js');
  const { Tenant } = await import('../../models/Tenant.js');
  const jwt        = await import('jsonwebtoken');

  let user = await User.findOne({ email: profile.email });

  if (!user) {
    // Auto-register: create tenant + owner user
    const tenant = await Tenant.create({ name: `${profile.name}'s CRM` });
    user = await User.create({
      tenantId: tenant._id,
      name:     profile.name,
      email:    profile.email,
      googleId: profile.googleId,
      role:     'owner',
      passwordHash: 'google-oauth', // no password needed
    });
  } else if (!user.googleId) {
    user.googleId = profile.googleId;
  }

  const existingTenant = await Tenant.findById(user.tenantId);
  if (existingTenant?.status === 'suspended') {
    throw new AppError('Esta cuenta está suspendida. Contactá al administrador.', 403);
  }

  user.lastLoginAt = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save();

  const isAdmin = env.adminEmails.includes((user.email || '').toLowerCase());
  const token = jwt.default.sign(
    { sub: user._id.toString(), tenantId: user.tenantId.toString(), role: user.role, email: user.email, isAdmin },
    env.jwtSecret,
    { expiresIn: env.jwtExpires },
  );

  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, isAdmin } });
});
