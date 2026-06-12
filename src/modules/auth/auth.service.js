import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { randomToken } from '../../utils/randomToken.js';
import { Tenant } from '../../models/Tenant.js';
import { User } from '../../models/User.js';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

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

// ── Password recovery ─────────────────────────────────────────────────────────

/**
 * Start a password reset. Generates a one-time token (stored hashed, 1h expiry)
 * and emails the reset link when email is configured. Always succeeds silently
 * (no user enumeration). Returns { emailed, link } for the caller to decide.
 */
export async function forgotPassword(email, baseUrl) {
  const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
  if (!user) return { emailed: false, link: null }; // don't reveal whether it exists

  const token = randomToken(40);
  user.resetTokenHash = sha256(token);
  user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
  await user.save();

  const link = `${baseUrl}/?reset=${token}`;
  let emailed = false;
  if (env.resendApiKey) {
    try {
      const { sendEmail } = await import('../../services/email.service.js');
      await sendEmail({
        to: user.email,
        subject: 'Restablecer tu contraseña — AgentPro',
        html: `<div style="font-family:sans-serif;color:#374151">
          <p>Hola ${user.name || ''},</p>
          <p>Pediste restablecer tu contraseña. Hacé clic en el botón (vence en 1 hora):</p>
          <p><a href="${link}" style="background:#6366F1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Restablecer contraseña</a></p>
          <p style="font-size:12px;color:#9ca3af">Si no fuiste vos, ignorá este email.</p>
        </div>`,
        text: `Restablecé tu contraseña: ${link}`,
      });
      emailed = true;
    } catch { /* email failed — caller falls back */ }
  }
  return { emailed, link };
}

/** Finish a password reset with the token from the email link. */
export async function resetPassword(token, newPassword) {
  if (!token || !newPassword || newPassword.length < 6) {
    throw new AppError('La contraseña debe tener al menos 6 caracteres', 400);
  }
  const user = await User.findOne({
    resetTokenHash: sha256(token),
    resetTokenExpires: { $gt: new Date() },
  });
  if (!user) throw new AppError('El enlace es inválido o expiró', 400);

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  return { ok: true };
}

/**
 * Break-glass recovery: reset a password using the RESET_SECRET configured in
 * the environment (proves infrastructure ownership). Used when email isn't set up.
 */
export async function recoverWithSecret(email, newPassword, secret) {
  if (!env.resetSecret) throw new AppError('La recuperación por clave no está habilitada', 403);
  const a = Buffer.from(String(secret || ''));
  const b = Buffer.from(env.resetSecret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError('Clave de recuperación incorrecta', 403);
  }
  if (!newPassword || newPassword.length < 6) {
    throw new AppError('La contraseña debe tener al menos 6 caracteres', 400);
  }
  const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
  if (!user) throw new AppError('No existe una cuenta con ese email', 404);

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  return { ok: true, email: user.email };
}
