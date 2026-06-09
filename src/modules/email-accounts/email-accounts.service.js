import net from 'node:net';
import tls from 'node:tls';
import { EmailAccount } from '../../models/EmailAccount.js';
import { AppError } from '../../utils/AppError.js';

export const list = (tenantId) =>
  EmailAccount.find({ tenantId }).sort({ createdAt: 1 }).lean();

export const getById = async (tenantId, id) => {
  const doc = await EmailAccount.findOne({ _id: id, tenantId }).lean();
  if (!doc) throw new AppError('Cuenta de email no encontrada', 404);
  return doc;
};

export const create = async (tenantId, data) => {
  const { name, fromEmail, fromName, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure } = data;
  if (!name || !fromEmail) throw new AppError('Nombre y email remitente son requeridos', 400);
  return EmailAccount.create({
    tenantId, name, fromEmail, fromName,
    smtpHost, smtpPort: smtpPort || 587,
    smtpUser, smtpPass, smtpSecure: !!smtpSecure,
  });
};

export const update = async (tenantId, id, data) => {
  const doc = await EmailAccount.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw new AppError('Cuenta de email no encontrada', 404);
  return doc;
};

export const remove = async (tenantId, id) => {
  const doc = await EmailAccount.findOneAndDelete({ _id: id, tenantId });
  if (!doc) throw new AppError('Cuenta de email no encontrada', 404);
};

/** Test TCP connectivity to the SMTP server (no auth check, just port reachability) */
export const testConnection = async (tenantId, id) => {
  const acc = await EmailAccount.findOne({ _id: id, tenantId });
  if (!acc) throw new AppError('Cuenta no encontrada', 404);
  if (!acc.smtpHost || !acc.smtpPort) {
    throw new AppError('Configurá el host y puerto SMTP primero', 400);
  }

  const ok = await new Promise((resolve) => {
    const timeout = setTimeout(() => { sock.destroy(); resolve(false); }, 8000);
    const sock = (acc.smtpSecure ? tls : net).connect(
      { host: acc.smtpHost, port: acc.smtpPort, rejectUnauthorized: false },
      () => { clearTimeout(timeout); sock.destroy(); resolve(true); },
    );
    sock.on('error', () => { clearTimeout(timeout); resolve(false); });
  });

  const status = ok ? 'active' : 'error';
  const lastError = ok ? null : `No se pudo conectar a ${acc.smtpHost}:${acc.smtpPort}`;
  await EmailAccount.findByIdAndUpdate(id, { status, lastTestedAt: new Date(), lastError });

  if (!ok) throw new AppError(lastError, 400);
  return { ok: true, host: acc.smtpHost, port: acc.smtpPort };
};

/**
 * Send a test email via SMTP — uses dynamic import of nodemailer if available,
 * otherwise returns a "pending" status so the UI doesn't break.
 */
export const sendTest = async (tenantId, id, toEmail) => {
  const acc = await EmailAccount.findOne({ _id: id, tenantId });
  if (!acc) throw new AppError('Cuenta no encontrada', 404);

  // Try to use nodemailer if installed; graceful fallback otherwise
  let nodemailer;
  try { nodemailer = (await import('nodemailer')).default; } catch { nodemailer = null; }

  if (!nodemailer) {
    return { ok: false, message: 'nodemailer no está instalado en este entorno. El test de conexión TCP sí está disponible.' };
  }

  const transport = nodemailer.createTransport({
    host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpSecure,
    auth: { user: acc.smtpUser, pass: acc.smtpPass },
  });

  await transport.sendMail({
    from: `"${acc.fromName || acc.name}" <${acc.fromEmail}>`,
    to: toEmail,
    subject: 'Prueba de conexión — AgentPro',
    html: '<p>✅ La conexión SMTP funciona correctamente desde <strong>AgentPro</strong>.</p>',
  });

  return { ok: true, to: toEmail };
};
