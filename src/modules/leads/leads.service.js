import { AppError } from '../../utils/AppError.js';
import { Lead } from '../../models/Lead.js';

export const list = (tenantId, filter = {}) =>
  Lead.find({ tenantId, ...filter })
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 });

export const getById = async (tenantId, id) => {
  const lead = await Lead.findOne({ _id: id, tenantId });
  if (!lead) throw new AppError('Lead not found', 404);
  return lead;
};

export const create = (tenantId, data) => Lead.create({ ...data, tenantId });

export const update = async (tenantId, id, data) => {
  const lead = await Lead.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true,
    runValidators: true,
  });
  if (!lead) throw new AppError('Lead not found', 404);
  return lead;
};

export const remove = async (tenantId, id) => {
  const lead = await Lead.findOneAndDelete({ _id: id, tenantId });
  if (!lead) throw new AppError('Lead not found', 404);
  return lead;
};
