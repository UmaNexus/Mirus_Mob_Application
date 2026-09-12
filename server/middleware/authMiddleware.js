import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyJwt, COOKIE_NAME } from '../utils/jwt.js';
import { setTenant } from '../utils/tenantContext.js';
import { roleHasPermission } from '../config/permissions.js';

/**
 * verifyToken — authenticates the request.
 * Reads the JWT from the HTTP-only cookie (preferred) or the
 * `Authorization: Bearer <token>` header, validates it, and loads the user.
 * Attaches the sanitized user document to `req.user`.
 */
export const verifyToken = asyncHandler(async (req, res, next) => {
  const cookieToken = req.cookies?.[COOKIE_NAME()];
  const header = req.headers.authorization || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }

  let payload;
  try {
    payload = verifyJwt(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired session');
  }

  // Establish the tenant context for this request BEFORE any scoped query runs.
  setTenant({ companyId: payload.companyId, role: payload.role });

  // Superadmins live in the platform tenant and read across companies.
  const query = User.findById(payload.sub).select('-password');
  const user = await (payload.role === 'superadmin' ? query.skipTenant() : query);
  if (!user) {
    throw new ApiError(401, 'Account no longer exists');
  }
  if (user.deletedAt) {
    throw new ApiError(403, 'This account has been deleted');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated');
  }

  req.user = user;
  next();
});

/**
 * authorizeRoles — guards state-changing endpoints by role.
 * Must run after verifyToken. Usage: authorizeRoles(['admin', 'hr'])
 */
export const authorizeRoles = (allowedRoles = []) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required'));
  }
  if (!allowedRoles.includes(req.user.role)) {
    return next(new ApiError(403, 'Insufficient permissions for this action'));
  }
  next();
};

/**
 * requirePermission — granular RBAC guard (Epic R). Must run after verifyToken.
 * Usage: requirePermission(PERMISSIONS.USER_DELETE)
 */
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!roleHasPermission(req.user.role, permission)) {
    return next(new ApiError(403, 'Insufficient permissions for this action'));
  }
  next();
};
