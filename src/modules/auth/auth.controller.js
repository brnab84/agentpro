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

/** GET /api/auth/me — current user with live-computed admin status. */
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('name email role').lean();
  if (!user) throw new AppError('Usuario no encontrado', 404);
  const isAdmin = env.adminEmails.includes((user.email || '').toLowerCase());
  res.json({ id: req.user.id, name: user.name, email: user.email, role: user.role, isAdmin });
});
