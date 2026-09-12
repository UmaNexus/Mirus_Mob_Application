/**
 * Operational error carrying an HTTP status code. Thrown from controllers and
 * caught by the central error handler so responses stay consistent.
 */
export default class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
