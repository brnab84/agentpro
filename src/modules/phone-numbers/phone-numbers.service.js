import { PhoneNumber } from '../../models/PhoneNumber.js';
import { AppError } from '../../utils/AppError.js';

export const list = (tenantId) =>
  PhoneNumber.find({ tenantId }).sort({ createdAt: 1 }).lean();

export const getById = async (tenantId, id) => {
  const doc = await PhoneNumber.findOne({ _id: id, tenantId }).lean();
  if (!doc) throw new AppError('Número no encontrado', 404);
  return doc;
};

export const create = async (tenantId, data) => {
  const { name, phoneNumberId, wabaId, displayPhone, accessToken } = data;
  if (!name || !phoneNumberId) throw new AppError('Nombre y Phone Number ID son requeridos', 400);
  return PhoneNumber.create({ tenantId, name, phoneNumberId, wabaId, displayPhone, accessToken, status: 'active' });
};

export const update = async (tenantId, id, data) => {
  const doc = await PhoneNumber.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw new AppError('Número no encontrado', 404);
  return doc;
};

export const remove = async (tenantId, id) => {
  const doc = await PhoneNumber.findOneAndDelete({ _id: id, tenantId });
  if (!doc) throw new AppError('Número no encontrado', 404);
};
