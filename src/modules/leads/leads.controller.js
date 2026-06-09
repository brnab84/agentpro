import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './leads.service.js';

export const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.stage) filter.stage = req.query.stage;
  if (req.user.role === 'agent') filter.assignedTo = req.user.id;
  res.json(await service.list(req.tenantId, filter));
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
  await service.remove(req.tenantId, req.params.id);
  res.status(204).send();
});

export const importLeads = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  const result = await service.importLeads(req.tenantId, rows);
  res.status(201).json(result);
});
