import { asyncHandler } from '../../utils/asyncHandler.js';
import { getDashboardStats } from './analytics.service.js';

export const getStats = asyncHandler(async (req, res) => {
  const stats = await getDashboardStats(req.tenantId);
  res.json(stats);
});
