import { AppError } from '../../utils/AppError.js';
import { Funnel } from '../../models/Funnel.js';
import { FunnelExecution } from '../../models/FunnelExecution.js';

export const list = (tenantId) =>
  Funnel.find({ tenantId }).sort({ createdAt: -1 });

export const getById = async (tenantId, id) => {
  const funnel = await Funnel.findOne({ _id: id, tenantId });
  if (!funnel) throw new AppError('Funnel not found', 404);
  return funnel;
};

export const create = (tenantId, data) =>
  Funnel.create({ ...data, tenantId });

export const update = async (tenantId, id, data) => {
  const funnel = await Funnel.findOneAndUpdate({ _id: id, tenantId }, data, {
    new: true,
    runValidators: true,
  });
  if (!funnel) throw new AppError('Funnel not found', 404);
  return funnel;
};

export const remove = async (tenantId, id) => {
  const funnel = await Funnel.findOneAndDelete({ _id: id, tenantId });
  if (!funnel) throw new AppError('Funnel not found', 404);
};

export const getStats = async (tenantId, funnelId) => {
  const executions = await FunnelExecution.find({ tenantId, funnelId }).lean();
  const running = executions.filter((e) => e.status === 'running').length;
  const completed = executions.filter((e) => e.status === 'completed').length;
  const cancelled = executions.filter((e) => e.status === 'cancelled').length;
  const profiles = {};
  executions.filter((e) => e.profile).forEach((e) => {
    profiles[e.profile] = (profiles[e.profile] || 0) + 1;
  });
  return { total: executions.length, running, completed, cancelled, profiles };
};

export const getLeads = (tenantId, funnelId) =>
  FunnelExecution.find({ tenantId, funnelId })
    .populate('leadId', 'name contact stage score')
    .sort({ createdAt: -1 })
    .limit(100);

export const findActiveByKeyword = (tenantId, keyword) =>
  Funnel.findOne({
    tenantId,
    status: 'active',
    'trigger.keyword': { $regex: new RegExp(`^${keyword}$`, 'i') },
  });

export const findRunningExecution = (tenantId, externalId) =>
  FunnelExecution.findOne({ tenantId, externalId, status: 'running' }).populate('funnelId');
