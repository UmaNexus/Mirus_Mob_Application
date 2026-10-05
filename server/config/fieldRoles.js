/**
 * Field-force role concepts, keyed by the EXACT JobRole.name stored in MongoDB
 * (matched case-insensitively, trimmed). `User.employeeDetails.jobRole -> JobRole.name`
 * is the only source of a user's field-force identity; nothing here is stored on users,
 * and `designation` / `User.role` are never consulted.
 *
 * The codes (BDM/ASM/RSM/ZSM) are application concepts for ordering and routing
 * only. A JobRole whose name is not listed here (HR, Accountant, Office assistant, ...) is a
 * valid HRMS role but NOT a field-force role: field-force endpoints reject it.
 *
 * `reportingManagerId` stays the only reporting relationship; the ranking below only says WHICH
 * role a person's manager may hold when a manager is assigned (application config, never stored).
 */

// ---- Reporting hierarchy (ranking, low -> high): BDM < ASM < RSM < ZSM < NSM < Admin ----
export const FIELD_HIERARCHY = ['BDM', 'ASM', 'RSM', 'ZSM', 'NSM', 'ADMIN'];

/** The ONLY level a person's reporting manager may hold. 'ADMIN' = the HRMS admin/superadmin role (User.role). */
export const REQUIRED_MANAGER = { BDM: 'ASM', ASM: 'RSM', RSM: 'ZSM', ZSM: 'NSM', NSM: 'ADMIN' };

// NSM has no representation in the application today and production has no NSM JobRole, so this level is
// UNMAPPED. When the business creates one, set its exact existing JobRole name here (the app never creates it).
export const NSM_JOB_ROLE_NAME = null;
export const isNsmMapped = () => Boolean(NSM_JOB_ROLE_NAME);

// TEMPORARY, explicit business decision: while the NSM level is unmapped, a ZSM's manager is an HRMS
// admin/superadmin (so ZSMs are not stranded). Remove this flag, or map NSM above, to enforce ZSM -> NSM strictly.
export const ADMIN_ACTS_AS_UNMAPPED_NSM = true;

export const FIELD_ROLES = [
  { name: 'Business development manager', code: 'BDM', leaf: true },
  { name: 'Area sales manager', code: 'ASM', manager: true },
  { name: 'Regional business manager', code: 'RSM', manager: true },
  { name: 'Zonal sales manager', code: 'ZSM', manager: true },
  ...(NSM_JOB_ROLE_NAME ? [{ name: NSM_JOB_ROLE_NAME, code: 'NSM', manager: true }] : [])
];

// Deliberately NOT mapped (no field-force permissions are granted for them):
//  - 'Office admin': a JobRole, not a field-force role and not an NSM. `User.role` (admin/hr/...) is
//    the HRMS authorization concept and is never derived from a JobRole.
//  - 'HR', 'Accountant', 'Office assistant': valid HRMS job roles without field-force access.
//  - There is no NSM JobRole in production, so no "executive" field role exists: the executive
//    monitoring experience stays reserved to HRMS admin/superadmin, exactly as before.

export const normalizeRoleName = (name) => String(name ?? '').trim().toLowerCase();

const BY_NAME = new Map(FIELD_ROLES.map((r) => [normalizeRoleName(r.name), r]));

/** Field-role concept for a JobRole name, or null when the name is not a field-force role. */
export const fieldRoleForName = (name) => BY_NAME.get(normalizeRoleName(name)) || null;

