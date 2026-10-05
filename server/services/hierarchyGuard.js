import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { wouldCreateCycle, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';
import { JOB_ROLE_POPULATE, roleOf, isAdminRole, codeUserFilter } from './fieldIdentity.js';
import {
  REQUIRED_MANAGER, ADMIN_ACTS_AS_UNMAPPED_NSM, isNsmMapped, fieldRoleForName
} from '../config/fieldRoles.js';


const MANAGER_SELECT = 'personalDetails email role isActive deletedAt employeeDetails.jobRole';
const LEVEL_LABEL = {
  BDM: 'a BDM (Business development manager)',
  ASM: 'an ASM (Area sales manager)',
  RSM: 'an RSM (Regional business manager)',
  ZSM: 'a ZSM (Zonal sales manager)',
  NSM: 'an NSM',
  ADMIN: 'an Admin'
};

/** Canonical level of a user for hierarchy purposes: BDM/ASM/RSM/ZSM(/NSM) from the JobRole, 'ADMIN' for HRMS admins, else null. */
export const levelOf = (user) => (isAdminRole(user) ? 'ADMIN' : roleOf(user).code);

/** The level a person's manager must hold, e.g. 'ASM' for a BDM; null when the level has no rule (non-field user). */
export const requiredManagerLevel = (level) => REQUIRED_MANAGER[level] || null;

/** Pure rule: may `candidate` (a populated user doc) be the reporting manager of someone at `targetLevel`? */
export const isEligibleManager = (targetLevel, candidate) => {
  if (!candidate) return false;
  if (targetLevel === 'ADMIN') return false; // Admin is the top: no field-force reporting manager
  const required = requiredManagerLevel(targetLevel);
  if (!required) {
    // Not a field-force role (no JobRole / HR / Accountant / Office assistant / Office admin): the field-force
    // ladder does not apply; keep the generic rule — an Admin or the holder of a valid JobRole.
    return isAdminRole(candidate) || roleOf(candidate).hasJobRole;
  }
  if (required === 'ADMIN') return isAdminRole(candidate);
  if (required === 'NSM' && !isNsmMapped()) return ADMIN_ACTS_AS_UNMAPPED_NSM && isAdminRole(candidate);
  return !isAdminRole(candidate) && roleOf(candidate).code === required;
};

const expectedText = (targetLevel) => {
  const required = requiredManagerLevel(targetLevel);
  if (!required) return 'an Admin or the holder of a job role';
  if (required === 'NSM' && !isNsmMapped()) {
    return ADMIN_ACTS_AS_UNMAPPED_NSM ? 'an Admin (no NSM job role exists yet)' : 'an NSM (no NSM job role exists yet)';
  }
  return LEVEL_LABEL[required];
};

const targetLevelFor = (target, roleNameOverride) => {
  if (isAdminRole(target)) return 'ADMIN';
  if (roleNameOverride !== undefined) return roleNameOverride ? fieldRoleForName(roleNameOverride)?.code || null : null;
  return roleOf(target).code;
};

/**
 * Re-looks-up and fully validates a candidate reporting manager — never trusts the client. Rules: not self; exists in
 * the caller's company (a cross-company id never resolves — `tenantScope`); not soft-deleted; active; the HIERARCHY
 * rule above (against the target's role — `roleNameOverride` = the JobRole name being assigned in the same request,
 * `null` = the role is being cleared, undefined = the stored role); and no circular chain.
 */
export const assertValidManager = async ({ targetUserId, candidateManagerId, roleNameOverride, session = null }) => {
  if (String(candidateManagerId) === String(targetUserId)) {
    throw new ApiError(400, 'A user cannot be their own reporting manager');
  }
  const [target, manager] = await Promise.all([
    User.findById(targetUserId).select('role employeeDetails.jobRole').populate(JOB_ROLE_POPULATE).session(session),
    User.findById(candidateManagerId).select(MANAGER_SELECT).populate(JOB_ROLE_POPULATE).session(session)
  ]);
  if (!target) throw new ApiError(404, 'User not found');
  if (!manager || manager.deletedAt) throw new ApiError(400, 'Invalid reporting manager');
  if (!manager.isActive) throw new ApiError(400, 'Cannot assign an inactive user as a reporting manager');

  const level = targetLevelFor(target, roleNameOverride);
  if (level === 'ADMIN') throw new ApiError(400, 'An Admin is the top of the hierarchy and has no reporting manager');
  if (!isEligibleManager(level, manager)) {
    throw new ApiError(400, level
      ? `A ${level} must report to ${expectedText(level)}`
      : 'A reporting manager must be an Admin or hold a job role');
  }
  if (await wouldCreateCycle(targetUserId, candidateManagerId)) {
    throw new ApiError(400, 'This reporting-manager assignment would create a circular reporting relationship');
  }
  return manager;
};

/**
 * The candidates a reporting-manager picker may show for `target` (a user doc): ONLY users who satisfy
 * isEligibleManager — invalid lower/same-level users are excluded, not merely sorted. Active, same company
 * (tenantScope), not the user themself, and never one of their own descendants (that would be a cycle).
 * `active: false` lists the otherwise-eligible INACTIVE users (used only to explain an empty list to the admin).
 */
export const listEligibleManagers = async ({ target, roleNameOverride, active = true }) => {
  const level = targetLevelFor(target, roleNameOverride);
  if (level === 'ADMIN') return [];
  const required = requiredManagerLevel(level);
  const base = { isActive: active, deletedAt: null, _id: { $ne: target._id } };
  const adminFilter = { role: { $in: ['admin', 'superadmin'] } };
  let filter;
  if (!required) {
    filter = { ...base, $or: [adminFilter, { 'employeeDetails.jobRole': { $ne: null } }] };
  } else if (required === 'ADMIN' || (required === 'NSM' && !isNsmMapped())) {
    const adminsAllowed = required === 'ADMIN' || ADMIN_ACTS_AS_UNMAPPED_NSM;
    filter = adminsAllowed ? { ...base, ...adminFilter } : { ...base, _id: { $in: [] } };
  } else {
    filter = { ...base, role: { $nin: ['admin', 'superadmin'] }, ...(await codeUserFilter(required)) };
  }
  const [users, subtree] = await Promise.all([
    User.find(filter)
      .select('personalDetails email role employeeDetails.employeeId employeeDetails.jobRole')
      .populate(JOB_ROLE_POPULATE)
      .sort({ 'personalDetails.firstName': 1 }),
    buildReportingSubtreeIds(target._id)
  ]);
  return users.filter((u) => !subtree.has(String(u._id)) && isEligibleManager(level, u));
};

/**
 * READ-ONLY audit of stored relationships against the hierarchy. `users` are populated user docs / lean
 * objects (admins, role holders, …). Returns the invalid ones; never modifies anything.
 */
export const findInvalidRelationships = (users) => {
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const out = [];
  for (const u of users) {
    const managerId = u.employeeDetails?.reportingManagerId;
    if (!managerId) continue;
    const level = levelOf(u);
    if (!level) continue; // non-field users are not governed by the field-force ladder
    const manager = byId.get(String(managerId));
    if (!manager) continue; // manager is outside the loaded set: cannot judge here
    const okay = level === 'ADMIN' ? false : isEligibleManager(level, manager);
    if (!okay) {
      out.push({
        userId: String(u._id),
        level,
        managerId: String(managerId),
        managerLevel: levelOf(manager) || (roleOf(manager).name ? `other (${roleOf(manager).name})` : 'no role'),
        expected: level === 'ADMIN' ? 'no reporting manager' : expectedText(level)
      });
    }
  }
  return out;
};
