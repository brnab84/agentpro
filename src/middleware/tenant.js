import { AppError } from '../utils/AppError.js';

// Guarantees every downstream query is scoped to the authenticated tenant.
export function tenantScope(req, res, next) {
  if (!req.user?.tenantId) return next(new AppError('No tenant context', 403));
  req.tenantId = req.user.tenantId;
  next();
}
