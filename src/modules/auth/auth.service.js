import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { Tenant } from '../../models/Tenant.js';
import { User } from '../../models/User.js';

function isAdminEmail(email) {
  return env.adminEmails.includes((email || '').toLowerCase());
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      tenantId: user.tenantId.toString(),
      role: user.role,
      email: user.email,
      isAdmin: isAdminEmail(user.email),
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpires },
  );
}

export async function register({ tenantName, name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already registered', 409);

  const tenant = await Tenant.create({ name: tenantName });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    tenantId: tenant._id,
    name,
    email,
    passwordHash,
    role: 'owner',
  });

  return {
    token: signToken(user),
    user: { id: user._id, name, email, role: user.role, isAdmin: isAdminEmail(email) },
  };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email });
  if (!user) throw new AppError('Invalid credentials', 401);

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new AppError('Invalid credentials', 401);

  const tenant = await Tenant.findById(user.tenantId);
  if (tenant?.status === 'suspended') {
    throw new AppError('Esta cuenta está suspendida. Contactá al administrador.', 403);
  }

  user.lastLoginAt = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save();

  return {
    token: signToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, isAdmin: isAdminEmail(user.email) },
  };
}
