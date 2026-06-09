import { AppError } from '../../utils/AppError.js';
import { Appointment } from '../../models/Appointment.js';

export const list = (tenantId) =>
  Appointment.find({ tenantId })
    .populate('leadId', 'name contact')
    .populate('propertyId', 'title zone')
    .sort({ datetime: 1 });

export const getById = async (tenantId, id) => {
  const item = await Appointment.findOne({ _id: id, tenantId });
  if (!item) throw new AppError('Appointment not found', 404);
  return item;
};

export const create = (tenantId, data) => Appointment.create({ ...data, tenantId });

export const update = async (tenantId, id, data) => {
  const item = await Appointment.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new AppError('Appointment not found', 404);
  return item;
};

export const remove = async (tenantId, id) => {
  const item = await Appointment.findOneAndDelete({ _id: id, tenantId });
  if (!item) throw new AppError('Appointment not found', 404);
  return item;
};

/** Upcoming appointments (from now, next 30 days) — used for Google Calendar sync */
export const listUpcoming = (tenantId) => {
  const now   = new Date();
  const limit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return Appointment.find({ tenantId, datetime: { $gte: now, $lte: limit } })
    .populate('leadId', 'name')
    .sort({ datetime: 1 });
};
