import { AppError } from '../utils/AppError.js';

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join(', ');
    return next(new AppError(msg, 422));
  }
  req.body = result.data;
  next();
};
