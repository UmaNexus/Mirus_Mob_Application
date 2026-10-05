import User from '../models/User.js';
import Company from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken, cookieOptions, COOKIE_NAME } from '../utils/jwt.js';
import { setTenant } from '../utils/tenantContext.js';
import { JOB_ROLE_POPULATE, fieldAccessFor } from '../services/fieldIdentity.js';

/**
 * Strip sensitive/internal fields before returning a user to the client.
 * `select('-password')` already removes the hash; this is a defensive shape.
 */
const toPublicUser = (user) => {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  return obj;
};

/**
 * POST /api/auth/login
 * Authenticates by company code + (email OR employeeId) + password.
 * US 1.1: invalid credentials always return a generic 401 (no user enumeration).
 */
export const login = asyncHandler(async (req, res) => {
  const { companySlug, password } = req.body;
  const identifier = String(req.body.identifier || req.body.email || '').trim();

  const genericError = new ApiError(401, 'Invalid company code, email/Employee ID or password');

  // Resolve the tenant first (company code). Missing slug fails generically to
  // avoid revealing which companies exist.
  if (!companySlug) throw genericError;
  const company = await Company.findOne({ slug: String(companySlug).toLowerCase().trim() });
  if (!company || company.status !== 'active') throw genericError;

  // Scope this request to the resolved tenant so the user lookup is isolated.
  setTenant({ companyId: company._id, role: null });

  let user = null;
  if (identifier.includes('@')) {
    user = await User.findOne({ companyId: company._id, email: identifier.toLowerCase() });
  } else {
    const empId = identifier.toUpperCase();
    user = await User.findOne({ companyId: company._id, 'employeeDetails.employeeId': empId });
    if (!user && empId !== identifier) {
      user = await User.findOne({ companyId: company._id, 'employeeDetails.employeeId': identifier });
    }
  }
  if (!user) throw genericError;

  const matches = await user.comparePassword(password);
  if (!matches) throw genericError;

  // Soft-deleted accounts must never authenticate (even if isActive were stale).
  if (user.deletedAt) {
    throw new ApiError(403, 'This account has been deleted. Contact your administrator.');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated. Contact your administrator.');
  }

  user.lastLogin = new Date();
  await user.save();

  const token = signToken(user);
  res.cookie(COOKIE_NAME(), token, cookieOptions());

  // Mobile clients cannot read an HTTP-only Set-Cookie into a token they can
  // attach as `Authorization: Bearer`, so — and only when the request
  // explicitly identifies itself as the mobile client via `X-Client: mobile`
  // — also return the raw token in the JSON body. The web app never sends
  // this header, so its response shape (and its cookie-only auth model) is
  // completely unchanged.
  const isMobileClient = req.headers['x-client'] === 'mobile';

  // Resolve the JobRole name (company-pinned: a foreign/deleted id resolves to null)
  // and the server-authoritative field access summary the mobile app routes on.
  await user.populate({ ...JOB_ROLE_POPULATE, match: { companyId: user.companyId } });
  const fieldAccess = await fieldAccessFor(user);

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    user: toPublicUser(user),
    fieldAccess,
    ...(isMobileClient ? { token } : {})
  });
});

/**
 * POST /api/auth/logout
 * Clears the auth cookie. Idempotent — safe to call when already logged out.
 */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE_NAME(), { ...cookieOptions(), maxAge: undefined });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user (set by verifyToken).
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  // Company is the tenant root (not itself tenant-scoped) — plain lookup.
  const company = req.user.companyId
    ? await Company.findById(req.user.companyId).select('name slug branding status')
    : null;
  const fieldAccess = await fieldAccessFor(req.user);
  res.status(200).json({ success: true, user: toPublicUser(req.user), fieldAccess, company });
});
