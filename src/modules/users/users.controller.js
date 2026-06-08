import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './users.service.js';

export const getChannels = asyncHandler(async (req, res) => {
  res.json(await service.getChannelConfig(req.tenantId));
});

export const updateChannels = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') throw new AppError('Only owners can update channel config', 403);
  res.json(await service.updateChannelConfig(req.tenantId, req.body));
});

export const list = asyncHandler(async (req, res) => {
  res.json(await service.listAgents(req.tenantId));
});

export const invite = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') throw new AppError('Only owners can invite agents', 403);
  res.status(201).json(await service.inviteAgent(req.tenantId, req.body));
});

export const remove = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') throw new AppError('Only owners can remove agents', 403);
  await service.removeAgent(req.tenantId, req.params.id);
  res.status(204).send();
});
