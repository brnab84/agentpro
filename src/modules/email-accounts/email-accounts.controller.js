import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './email-accounts.service.js';

export const list      = asyncHandler(async (req, res) => res.json(await service.list(req.tenantId)));
export const getById   = asyncHandler(async (req, res) => res.json(await service.getById(req.tenantId, req.params.id)));
export const create    = asyncHandler(async (req, res) => res.status(201).json(await service.create(req.tenantId, req.body)));
export const update    = asyncHandler(async (req, res) => res.json(await service.update(req.tenantId, req.params.id, req.body)));
export const remove    = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') throw new AppError('Solo owners pueden eliminar cuentas de email', 403);
  await service.remove(req.tenantId, req.params.id);
  res.status(204).send();
});
export const testConnection = asyncHandler(async (req, res) =>
  res.json(await service.testConnection(req.tenantId, req.params.id)));
export const sendTest  = asyncHandler(async (req, res) => {
  const { toEmail } = req.body;
  if (!toEmail) throw new AppError('toEmail es requerido', 400);
  res.json(await service.sendTest(req.tenantId, req.params.id, toEmail));
});
