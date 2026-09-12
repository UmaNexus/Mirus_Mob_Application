import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import { MAX_TRAINING_VIDEO_MB } from './uploadVideo.js';

/** 404 fallback for unmatched routes. */
export const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

const multerSizeMessage = (req) => {
  const url = String(req?.originalUrl || req?.path || '');
  if (url.includes('/training/')) {
    return `Video exceeds the ${MAX_TRAINING_VIDEO_MB}MB limit. Allowed formats: MP4, WEBM, or MOV.`;
  }
  if (url.includes('/documents') || url.includes('/uploaded-docs') || url.includes('/performance/')) {
    return 'File exceeds the 5MB limit. Only PDF documents are accepted.';
  }
  return 'File exceeds the maximum allowed size';
};

/**
 * Central error handler. Normalizes operational errors, Mongoose validation
 * and duplicate-key errors, and Multer upload errors into a consistent shape.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? multerSizeMessage(req) : err.message;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A record with this ${field} already exists`;
  }

  if (statusCode >= 500) {
    console.error('❌ Unhandled error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {})
  });
};
