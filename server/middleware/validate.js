import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

/**
 * Terminal middleware for express-validator chains. Collects accumulated
 * validation errors and short-circuits with a 400 before any DB mutation.
 */
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(new ApiError(400, 'Validation failed', details));
  }
  next();
};

export default validate;
