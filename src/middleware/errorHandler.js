import { AppError } from '../utils/AppError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  if (!isAppError) console.error(err);
  res.status(statusCode).json({
    error: isAppError ? err.message : 'Internal server error',
  });
}
