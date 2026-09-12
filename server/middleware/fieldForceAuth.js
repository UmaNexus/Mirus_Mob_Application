import ApiError from '../utils/ApiError.js';
import User from '../models/User.js';
import { PERMISSIONS, roleHasPermission } from '../config/permissions.js';
import { isValidFieldTier, tierAtLeast } from '../config/fieldForce.js';

/**
 * Field-force authorization scaffolding (Milestone 4, Domain 1).
 *
 * The mobile business-ops hierarchy (NSM→ZSM→RSM→ASM→BDM) is a *separate*
 * dimension from the existing HRMS `role`/permission system — see
 * config/fieldForce.js. Every check here reads only from `req.user` (populated
 * exclusively by `verifyToken` from the verified JWT + a fresh DB lookup) and
 * from the database — never from client-supplied body/query/params — so a
 * request cannot become authorized just because the mobile UI shows a screen.
 *
 * Every export here must be used *after* `verifyToken` has run, and every
 * database read performed here executes inside the request's tenant context,
 * so the existing `tenantScope` Mongoose plugin already confines it to the
 * caller's own company — cross-tenant access is not a separate check to add.
 */

/**
 * True if the actor's *existing HRMS role* already grants company-wide
 * field-ops visibility (admin/superadmin hold FIELDOPS_MONITOR via their role
 * permission set). This is the "Admin → company-wide access according to
 * permissions" branch of the access model.
 */
export const hasCompanyWideFieldOpsAccess = (user) =>
  roleHasPermission(user.role, PERMISSIONS.FIELDOPS_MONITOR);

/**
 * requireFieldTier(minTier) — Express middleware, must run after `verifyToken`.
 *
 * Grants access when the caller either:
 *  - already has company-wide field-ops access via their HRMS role (admin/
 *    superadmin), or
 *  - carries a `fieldForce.tier` at or above `minTier` in the hierarchy.
 *
 * This is tier #1–#3 of the six-point check the caller asked for (existing
 * authentication is `verifyToken` itself, which must run first). Reporting
 * hierarchy / ownership / tenant scope (#4–#6) are enforced separately by
 * `canAccessFieldOpsUser` / the tenantScope plugin, since those depend on the
 * specific resource being accessed, not just the caller's own tier.
 */
export const requireFieldTier = (minTier) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (hasCompanyWideFieldOpsAccess(req.user)) return next();

  const tier = req.user.employeeDetails?.fieldForce?.tier;
  if (!tier || !isValidFieldTier(tier) || !tierAtLeast(tier, minTier)) {
    return next(new ApiError(403, 'Insufficient field-force tier for this action'));
  }
  next();
};

/**
 * requireFieldCapability(permission, minTier) — Express middleware, must run
 * after `verifyToken`. Like `requireFieldTier`, but the role-based bypass
 * checks a specific domain permission (e.g. DOCTOR_MANAGE) instead of the
 * generic FIELDOPS_MONITOR — so admin/superadmin's existing wildcard/ALL
 * grants keep working, while every new domain (Doctor, DCR, MTP, ...) states
 * its own capability explicitly rather than overloading one flag for everything.
 */
export const requireFieldCapability = (permission, minTier) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (roleHasPermission(req.user.role, permission)) return next();

  const tier = req.user.employeeDetails?.fieldForce?.tier;
  if (!tier || !isValidFieldTier(tier) || !tierAtLeast(tier, minTier)) {
    return next(new ApiError(403, 'Insufficient field-force tier for this action'));
  }
  next();
};

/**
 * Walk down `employeeDetails.reportingManagerId` to collect every user who
 * (directly or transitively) reports to `managerId`. Runs as a plain `User`
 * query, so it inherits the request's tenant scope automatically (the
 * `tenantScope` plugin injects `companyId` into every `find()` call) — it can
 * never traverse into another company's reporting tree.
 *
 * `maxDepth` bounds the walk well beyond the hierarchy's actual depth (5
 * tiers) as a defensive guard against a malformed/cyclic reporting chain.
 */
export const buildReportingSubtreeIds = async (managerId, { maxDepth = 8 } = {}) => {
  const subtree = new Set();
  let frontier = [String(managerId)];
  let depth = 0;

  while (frontier.length && depth < maxDepth) {
    // eslint-disable-next-line no-await-in-loop
    const directReports = await User.find({ 'employeeDetails.reportingManagerId': { $in: frontier } })
      .select('_id')
      .lean();

    const nextFrontier = [];
    for (const report of directReports) {
      const id = String(report._id);
      if (!subtree.has(id)) {
        subtree.add(id);
        nextFrontier.push(id);
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }

  return subtree;
};

/**
 * True if `actor` may access `targetUserId`'s field-ops data:
 *  - it is the actor's own record (ownership), or
 *  - the actor holds company-wide field-ops access (admin/superadmin), or
 *  - `targetUserId` is anywhere in the actor's reporting subtree (organizational
 *    scope) — e.g. an ASM's subtree contains their BDMs, an RSM's contains
 *    those BDMs plus the ASMs between them, and so on up to NSM.
 *
 * An actor with no `fieldForce.tier` and no company-wide access can only ever
 * satisfy the "own record" branch.
 */
export const canAccessFieldOpsUser = async (actor, targetUserId) => {
  const targetId = String(targetUserId);
  if (String(actor._id) === targetId) return true;
  if (hasCompanyWideFieldOpsAccess(actor)) return true;
  if (!actor.employeeDetails?.fieldForce?.tier) return false;

  const subtree = await buildReportingSubtreeIds(actor._id);
  return subtree.has(targetId);
};

/**
 * assertFieldOpsAccess(actor, targetUserId) — throws 403 instead of returning
 * a boolean. Convenience for controllers that need to fail fast.
 */
export const assertFieldOpsAccess = async (actor, targetUserId) => {
  const allowed = await canAccessFieldOpsUser(actor, targetUserId);
  if (!allowed) {
    throw new ApiError(403, 'You are not authorized to access this field-force record');
  }
};

/**
 * Walk UP `employeeDetails.reportingManagerId` from `userId`, collecting every
 * manager above them (not including themselves). Used to validate "joint call
 * accompanied by" style fields, where the accompanying manager must genuinely
 * be somewhere in the submitter's own management chain — never an arbitrary
 * user the client names in the request body.
 */
export const buildReportingChainAbove = async (userId, { maxDepth = 8 } = {}) => {
  const chain = new Set();
  let currentId = String(userId);
  let depth = 0;

  while (depth < maxDepth) {
    // eslint-disable-next-line no-await-in-loop
    const current = await User.findById(currentId).select('employeeDetails.reportingManagerId').lean();
    const managerId = current?.employeeDetails?.reportingManagerId;
    if (!managerId) break;
    const managerIdStr = String(managerId);
    if (chain.has(managerIdStr)) break; // defensive cycle guard
    chain.add(managerIdStr);
    currentId = managerIdStr;
    depth += 1;
  }

  return chain;
};
