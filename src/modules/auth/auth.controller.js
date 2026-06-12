import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { User } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await service.register(req.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await service.login(req.body);
  res.json(result);
});

const baseUrlOf = (req) =>
  (env.appBaseUrl && env.appBaseUrl.replace(/\/$/, '')) || `${req.protocol}://${req.get('host')}`;

/** POST /api/auth/forgot-password — start reset (emails a link when configured). */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { emailed } = await service.forgotPassword(req.body?.email, baseUrlOf(req));
  // Never reveal whether the email exists.
  res.json({ ok: true, emailed });
});

/** POST /api/auth/reset-password — finish reset with the emailed token. */
export const resetPassword = asyncHandler(async (req, res) => {
  res.json(await service.resetPassword(req.body?.token, req.body?.password));
});

/** POST /api/auth/recover — break-glass reset using the RESET_SECRET. */
export const recover = asyncHandler(async (req, res) => {
  const { email, password, secret } = req.body || {};
  res.json(await service.recoverWithSecret(email, password, secret));
});

/** POST /api/auth/recover-accounts — list account emails (gated by RESET_SECRET). */
export const recoverAccounts = asyncHandler(async (req, res) => {
  res.json({ accounts: await service.listAccountsWithSecret(req.body?.secret) });
});

/** GET /api/auth/me — current user with live-computed admin status. */
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('name email role').lean();
  if (!user) throw new AppError('Usuario no encontrado', 404);
  const isAdmin = env.adminEmails.includes((user.email || '').toLowerCase());
  res.json({ id: req.user.id, name: user.name, email: user.email, role: user.role, isAdmin });
});
