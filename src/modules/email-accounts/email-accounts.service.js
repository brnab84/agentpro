import nodemailer from 'nodemailer';
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
  return EmailAccount.create({ tenantId, name, fromEmail, fromName, smtpHost, smtpPort: smtpPort || 587, smtpUser, smtpPass, smtpSecure: !!smtpSecure });
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

export const testConnection = async (tenantId, id) => {
  const acc = await EmailAccount.findOne({ _id: id, tenantId });
  if (!acc) throw new AppError('Cuenta no encontrada', 404);

  const transport = nodemailer.createTransport({
    host:   acc.smtpHost,
    port:   acc.smtpPort,
    secure: acc.smtpSecure,
    auth:   { user: acc.smtpUser, pass: acc.smtpPass },
    connectionTimeout: 8000,
    greetingTimeout:   5000,
  });

  try {
    await transport.verify();
    await EmailAccount.findByIdAndUpdate(id, { status: 'active', lastTestedAt: new Date(), lastError: null });
    return { ok: true };
  } catch (err) {
    await EmailAccount.findByIdAndUpdate(id, { status: 'error', lastTestedAt: new Date(), lastError: err.message });
    throw new AppError(`Error de conexión SMTP: ${err.message}`, 400);
  }
};

export const sendTest = async (tenantId, id, toEmail) => {
  const acc = await EmailAccount.findOne({ _id: id, tenantId });
  if (!acc) throw new AppError('Cuenta no encontrada', 404);

  const transport = nodemailer.createTransport({
    host:   acc.smtpHost,
    port:   acc.smtpPort,
    secure: acc.smtpSecure,
    auth:   { user: acc.smtpUser, pass: acc.smtpPass },
  });

  await transport.sendMail({
    from:    `"${acc.fromName || acc.name}" <${acc.fromEmail}>`,
    to:      toEmail,
    subject: 'Prueba de conexión — AgentPro',
    html:    '<p>✅ La conexión SMTP funciona correctamente desde <strong>AgentPro</strong>.</p>',
  });

  return { ok: true, to: toEmail };
};
