import { AppError } from '../../utils/AppError.js';
import { Property } from '../../models/Property.js';
import { assertCanAddProperty } from '../billing/limits.service.js';

export const list = (tenantId, filter = {}) =>
  Property.find({ tenantId, ...filter }).sort({ createdAt: -1 });

export const getById = async (tenantId, id) => {
  const item = await Property.findOne({ _id: id, tenantId });
  if (!item) throw new AppError('Property not found', 404);
  return item;
};

export const create = async (tenantId, data) => {
  await assertCanAddProperty(tenantId);
  return Property.create({ ...data, tenantId });
};

export const update = async (tenantId, id, data) => {
  const item = await Property.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new AppError('Property not found', 404);
  return item;
};

export const remove = async (tenantId, id) => {
  const item = await Property.findOneAndDelete({ _id: id, tenantId });
  if (!item) throw new AppError('Property not found', 404);
  return item;
};
