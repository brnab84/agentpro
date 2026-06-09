import { EmailSignature } from '../../models/EmailSignature.js';
import { AppError } from '../../utils/AppError.js';

export const list = (tenantId) =>
  EmailSignature.find({ tenantId }).sort({ createdAt: 1 }).lean();

export const getById = async (tenantId, id) => {
  const doc = await EmailSignature.findOne({ _id: id, tenantId }).lean();
  if (!doc) throw new AppError('Firma no encontrada', 404);
  return doc;
};

export const create = async (tenantId, data) => {
  const { name, html, isDefault } = data;
  if (!name) throw new AppError('El nombre es requerido', 400);
  if (isDefault) {
    // unset any existing default
    await EmailSignature.updateMany({ tenantId }, { $set: { isDefault: false } });
  }
  return EmailSignature.create({ tenantId, name, html: html || '', isDefault: !!isDefault });
};

export const update = async (tenantId, id, data) => {
  if (data.isDefault) {
    await EmailSignature.updateMany({ tenantId, _id: { $ne: id } }, { $set: { isDefault: false } });
  }
  const doc = await EmailSignature.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw new AppError('Firma no encontrada', 404);
  return doc;
};

export const remove = async (tenantId, id) => {
  const doc = await EmailSignature.findOneAndDelete({ _id: id, tenantId });
  if (!doc) throw new AppError('Firma no encontrada', 404);
};
