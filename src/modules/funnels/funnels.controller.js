import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './funnels.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.tenantId));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await service.getById(req.tenantId, req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.tenantId, req.body));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await service.update(req.tenantId, req.params.id, req.body));
});

export const remove = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') throw new AppError('Only owners can delete funnels', 403);
  await service.remove(req.tenantId, req.params.id);
  res.status(204).send();
});

export const getStats = asyncHandler(async (req, res) => {
  res.json(await service.getStats(req.tenantId, req.params.id));
});

export const getLeads = asyncHandler(async (req, res) => {
  res.json(await service.getLeads(req.tenantId, req.params.id));
});
