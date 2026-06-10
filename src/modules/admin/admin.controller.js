import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './admin.service.js';

/** GET /api/admin/overview — global KPIs */
export const getOverview = asyncHandler(async (_req, res) => {
  res.json(await service.getOverview());
});

/** GET /api/admin/tenants — all accounts with usage */
export const listTenants = asyncHandler(async (_req, res) => {
  res.json(await service.listTenants());
});

/** PATCH /api/admin/tenants/:id — change plan / status */
export const updateTenant = asyncHandler(async (req, res) => {
  const { plan, status } = req.body;
  res.json(await service.updateTenant(req.params.id, { plan, status }));
});

/** GET /api/admin/settings — configurable plan pricing */
export const getSettings = asyncHandler(async (_req, res) => {
  res.json(await service.getSettings());
});

/** PUT /api/admin/settings — update plan pricing */
export const updateSettings = asyncHandler(async (req, res) => {
  res.json(await service.updateSettings(req.body));
});
