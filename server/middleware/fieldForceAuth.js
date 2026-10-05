import ApiError from '../utils/ApiError.js';
import User from '../models/User.js';
import { PERMISSIONS, roleHasPermission } from '../config/permissions.js';
import {
  isFieldUser, isManagerUser, isAdminRole, leafUserFilter, JOB_ROLE_POPULATE
} from '../services/fieldIdentity.js';

/**
 * Field-force authorization scaffolding (Milestone 4, Domain 1).
 *
 * The mobile business-ops role (JobRole.name, see config/fieldRoles.js) is a *separate*
 * dimension from the existing HRMS `role`/permission system. Every check here reads only from `req.user` (populated
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
 * Role-level check behind the route gates, resolved from the caller's JobRole
 * (employeeDetails.jobRole -> JobRole.name; must be valid and active). The route-level
 * argument keeps its historical meaning: `'BDM'` = any field-force role; anything above
 * (`'ASM'`) = a manager-capability field role. A user without a valid field role
 * (no JobRole, inactive/deleted/foreign JobRole, HR/Accountant/...) never passes.
 */
const meetsFieldRole = async (user, minTier) => {
  if (!isFieldUser(user)) return false;
  if (minTier === 'BDM') return true;
  return isManagerUser(user);
};

/**
 * requireFieldTier(minTier) — Express middleware, must run after `verifyToken`.
 *
 * Grants access when the caller either:
 *  - already has company-wide field-ops access via their HRMS role (admin/
 *    superadmin), or
 *  - holds a field-force JobRole at or above `minTier`.
 *
 * This is tier #1–#3 of the six-point check the caller asked for (existing
 * authentication is `verifyToken` itself, which must run first). Reporting
 * hierarchy / ownership / tenant scope (#4–#6) are enforced separately by
 * `canAccessFieldOpsUser` / the tenantScope plugin, since those depend on the
 * specific resource being accessed, not just the caller's own tier.
 */
export const requireFieldTier = (minTier) => async (req, res, next) => {
  try {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (hasCompanyWideFieldOpsAccess(req.user)) return next();
    if (!(await meetsFieldRole(req.user, minTier))) {
      return next(new ApiError(403, 'Insufficient field-force role for this action'));
    }
    next();
  } catch (err) { next(err); }
};

/**
 * requireFieldCapability(permission, minTier) — Express middleware, must run
 * after `verifyToken`. Like `requireFieldTier`, but the role-based bypass
 * checks a specific domain permission (e.g. DOCTOR_MANAGE) instead of the
 * generic FIELDOPS_MONITOR — so admin/superadmin's existing wildcard/ALL
 * grants keep working, while every new domain (Doctor, DCR, MTP, ...) states
 * its own capability explicitly rather than overloading one flag for everything.
 */
export const requireFieldCapability = (permission, minTier) => async (req, res, next) => {
  try {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (roleHasPermission(req.user.role, permission)) return next();
    if (!(await meetsFieldRole(req.user, minTier))) {
      return next(new ApiError(403, 'Insufficient field-force role for this action'));
    }
    next();
  } catch (err) { next(err); }
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
 * An actor with no field-force JobRole and no company-wide access can only ever
 * satisfy the "own record" branch.
 */
export const canAccessFieldOpsUser = async (actor, targetUserId) => {
  const targetId = String(targetUserId);
  if (String(actor._id) === targetId) return true;
  if (hasCompanyWideFieldOpsAccess(actor)) return true;
  if (!isFieldUser(actor)) return false;

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

/**
 * True if making `candidateManagerId` the reporting manager of `userId`
 * would create a cycle — i.e. `userId` is themselves already somewhere in
 * `candidateManagerId`'s own upward chain (including being the same
 * person). Walks `reportingManagerId` upward from the *candidate*, the same
 * direction as `buildReportingChainAbove`, since the new edge from `userId`
 * to `candidateManagerId` hasn't been saved yet and so can't be walked from
 * `userId` itself.
 */
export const wouldCreateCycle = async (userId, candidateManagerId, { maxDepth = 10 } = {}) => {
  const userIdStr = String(userId);
  let currentId = String(candidateManagerId);
  const seen = new Set();
  let depth = 0;

  while (currentId && depth < maxDepth) {
    if (currentId === userIdStr) return true;
    if (seen.has(currentId)) return true; // a pre-existing cycle upstream — never safe to attach to
    seen.add(currentId);
    // eslint-disable-next-line no-await-in-loop
    const current = await User.findById(currentId).select('employeeDetails.reportingManagerId').lean();
    const nextId = current?.employeeDetails?.reportingManagerId;
    currentId = nextId ? String(nextId) : null;
    depth += 1;
  }
  return false;
};

const PARTICIPANT_SELECT = 'personalDetails.firstName personalDetails.lastName role employeeDetails.jobRole';

/**
 * The caller's own eligible Joint Call / Manager Meeting participants:
 *  - `managers`: every ASM+ tier manager genuinely above them
 *    (`buildReportingChainAbove` — a straight walk up `reportingManagerId`,
 *    so it can never include a peer/unrelated user or cross-tenant record).
 *    Admin is deliberately excluded here even when present in the raw
 *    chain (unlike MTP's approver list, which does include admin via
 *    company-wide access) — Admin is not a "manager participant".
 *  - `others`: every other BDM who shares the caller's own immediate
 *    reporting manager — the "same ASM/team" rule. Never a company-wide
 *    BDM list, never another team's BDM.
 *
 * Single source of truth for both the mobile picker and server-side
 * validation of a submitted participant id — see
 * `isEligibleJointCallParticipant` / `isEligibleManagerParticipant` below.
 */
export const resolveJointCallParticipants = async (userId) => {
  const chainIds = [...(await buildReportingChainAbove(userId))];
  const chainUsers = chainIds.length
    ? await User.find({ _id: { $in: chainIds } }).select(PARTICIPANT_SELECT).populate(JOB_ROLE_POPULATE)
    : [];
  // A chain member is a "manager participant" if their JobRole is a manager-capability
  // field role. Admin/superadmin (HRMS role) are never participants.
  const managers = chainUsers.filter((u) => !isAdminRole(u) && isManagerUser(u));

  const caller = await User.findById(userId).select('employeeDetails.reportingManagerId');
  const managerId = caller?.employeeDetails?.reportingManagerId;
  let others = [];
  if (managerId) {
    const peers = await User.find({
      $and: [
        { _id: { $ne: userId }, 'employeeDetails.reportingManagerId': managerId, deletedAt: null },
        await leafUserFilter() // "Others" = same-team peers in the leaf (BDM) role
      ]
    }).select(PARTICIPANT_SELECT).populate(JOB_ROLE_POPULATE);
    others = peers;
  }

  return { managers, others };
};

/** True if `candidateId` is a genuinely eligible Joint Call companion for `userId` — a real manager above them (a manager-capability JobRole), or a same-team BDM. */
export const isEligibleJointCallParticipant = async (userId, candidateId) => {
  if (!candidateId) return false;
  const { managers, others } = await resolveJointCallParticipants(userId);
  const candidateIdStr = String(candidateId);
  return managers.some((u) => String(u._id) === candidateIdStr) || others.some((u) => String(u._id) === candidateIdStr);
};

/** True if `candidateId` is a genuinely eligible manager-meeting participant for `userId` — a real manager above them; never a BDM peer, never Admin. */
export const isEligibleManagerParticipant = async (userId, candidateId) => {
  if (!candidateId) return false;
  const { managers } = await resolveJointCallParticipants(userId);
  return managers.some((u) => String(u._id) === String(candidateId));
};
