import User from '../models/User.js';
import JobRole from '../models/JobRole.js';
import { fieldRoleForName } from '../config/fieldRoles.js';

/**
 * Field-force identity, resolved ONLY from `employeeDetails.jobRole -> JobRole.name`.
 *
 * Rules:
 *  - A user with no jobRole, a deleted / other-company / inactive JobRole, or a JobRole
 *    that is not a field-force role (HR, Accountant, ...) simply has no field role —
 *    never an error. Field-force endpoints then answer 403; HRMS features are unaffected.
 *  - Authorization never reads `designation` or any legacy tier.
 *  - `reportingManagerId` is the only hierarchy; roles only describe capability.
 */

/** Populate spec that resolves a user's JobRole (tenant-scoped by the JobRole model's plugin). */
export const JOB_ROLE_POPULATE = { path: 'employeeDetails.jobRole', select: 'name active' };

const asId = (v) => (v == null ? null : String(v._id || v));

/** Resolved role info for any user shape. Safe on null / unpopulated / dangling jobRole. */
export const roleOf = (user) => {
  const jr = user?.employeeDetails?.jobRole;
  const resolved = jr && typeof jr === 'object' && typeof jr.name === 'string' && jr.name && jr.active !== false ? jr : null;
  const concept = resolved ? fieldRoleForName(resolved.name) : null;
  return {
    hasJobRole: Boolean(resolved),
    jobRoleId: resolved ? asId(resolved) : null,
    name: resolved ? resolved.name : null,
    code: concept?.code || null,
    isFieldRole: Boolean(concept),
    isLeaf: Boolean(concept?.leaf),
    isManager: Boolean(concept?.manager)
  };
};

/** Public `{id, name}` for API responses, or null. */
export const publicJobRole = (user) => {
  const r = roleOf(user);
  return r.hasJobRole ? { id: r.jobRoleId, name: r.name } : null;
};

export const isAdminRole = (user) => user?.role === 'admin' || user?.role === 'superadmin';

/** Holds a valid, active JobRole that is a field-force role. */
export const isFieldUser = (user) => roleOf(user).isFieldRole;
/** Field role with manager capability (ASM and above). */
export const isManagerUser = (user) => roleOf(user).isManager;
/**
 * Executive monitoring access is reserved to the HRMS admin/superadmin role: production has no
 * NSM-level JobRole, and no JobRole (e.g. Office admin) is silently promoted to executive.
 */
export const isExecutiveUser = (user) => isAdminRole(user);

export const hasDirectReports = async (userId) =>
  Boolean(await User.exists({ 'employeeDetails.reportingManagerId': userId, deletedAt: null }));

/**
 * ids of the ACTIVE JobRoles whose field-role concept matches `predicate` (tenant-scoped
 * by the model plugin when a request context exists; across companies for scheduler jobs).
 */
const jobRoleIdsWhere = async (predicate) => {
  const roles = await JobRole.find({ active: true }).select('name').lean();
  return roles.filter((r) => {
    const c = fieldRoleForName(r.name);
    return c && predicate(c);
  }).map((r) => r._id);
};

/** Mongo filter: users whose JobRole maps to the given canonical field code (BDM/ASM/RSM/ZSM/NSM). */
export const codeUserFilter = async (code) => ({ 'employeeDetails.jobRole': { $in: await jobRoleIdsWhere((c) => c.code === code) } });

/** Mongo filter: users whose JobRole is a field-force role. */
export const fieldUserFilter = async () => ({ 'employeeDetails.jobRole': { $in: await jobRoleIdsWhere(() => true) } });
/** Mongo filter: users whose JobRole is the leaf (BDM) role. */
export const leafUserFilter = async () => ({ 'employeeDetails.jobRole': { $in: await jobRoleIdsWhere((c) => c.leaf) } });

/** Active leaf field users matching `filter`. */
export const findLeafFieldUsers = async (filter, select) =>
  User.find({ $and: [filter, await leafUserFilter()] })
    .select(`${select} employeeDetails.jobRole`)
    .populate(JOB_ROLE_POPULATE)
    .lean();

/**
 * Why a user has no field role (for support / the "no role" screen), or null when they do.
 *  NO_JOB_ROLE — no jobRole assigned; JOB_ROLE_UNRESOLVED — an id is stored but it does not resolve
 *  to an active JobRole of this company; NOT_A_FIELD_ROLE — a valid JobRole without field access.
 */
const noFieldRoleReason = (user, r) => {
  if (r.isFieldRole) return null;
  if (r.hasJobRole) return 'NOT_A_FIELD_ROLE';
  const stored = user?.populated?.('employeeDetails.jobRole') || (user?.employeeDetails?.jobRole && typeof user.employeeDetails.jobRole !== 'object');
  return stored ? 'JOB_ROLE_UNRESOLVED' : 'NO_JOB_ROLE';
};

/** Backend-authoritative access summary returned to clients (login, /auth/me). */
export const fieldAccessFor = async (user) => {
  const r = roleOf(user);
  return {
    reason: noFieldRoleReason(user, r),
    isFieldUser: r.isFieldRole,
    isManager: r.isManager,
    isExecutive: isExecutiveUser(user),
    roleName: r.name,
    roleCode: r.code,
    jobRole: publicJobRole(user)
  };
};
