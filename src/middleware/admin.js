import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Restricts a route to super-admins. Trusts the JWT isAdmin flag, but also
// re-checks the email against the current ADMIN_EMAILS list so revoking access
// takes effect on the next request (defense in depth).
export function requireAdmin(req, res, next) {
  const email = (req.user?.email || '').toLowerCase();
  const allowed = req.user?.isAdmin === true || env.adminEmails.includes(email);
  if (!allowed) return next(new AppError('Acceso restringido', 403));
  next();
}
