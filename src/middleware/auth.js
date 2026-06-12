import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';

const SEEN_THROTTLE_MS = 120_000; // refresh lastSeenAt at most every 2 min per user
const _lastWrite = new Map();     // userId → ms of last DB write (in-memory throttle)

/** Fire-and-forget: refresh the user's last-activity timestamp (throttled in memory). */
function touchLastSeen(userId) {
  const now = Date.now();
  if (now - (_lastWrite.get(userId) || 0) < SEEN_THROTTLE_MS) return; // skip the DB hit
  _lastWrite.set(userId, now);
  if (_lastWrite.size > 5000) _lastWrite.clear(); // bound memory
  User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {});
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
