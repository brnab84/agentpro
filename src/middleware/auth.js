import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';

const SEEN_THROTTLE_MS = 120_000; // write lastSeenAt at most every 2 min per user

/** Fire-and-forget: refresh the user's last-activity timestamp (throttled). */
function touchLastSeen(userId) {
  const cutoff = new Date(Date.now() - SEEN_THROTTLE_MS);
  User.updateOne(
    { _id: userId, lastSeenAt: { $not: { $gte: cutoff } } }, // null/old only
    { $set: { lastSeenAt: new Date() } },
  ).catch(() => {});
}

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError('Missing token', 401));

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
      isAdmin: payload.isAdmin === true,
    };
    touchLastSeen(payload.sub);
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}
