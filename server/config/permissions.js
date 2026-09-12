/**
 * Permission-based RBAC (Epic R).
 *
 * Routes guard on granular permissions via `requirePermission(...)` rather than
 * role names, so the Admin/HR split (and future roles) is a data change here —
 * not edits scattered across every route. `superadmin` holds the wildcard.
 */

// Catalog of every guarded capability.
export const PERMISSIONS = {
  // Directory / users
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_ROLE_CHANGE: 'user:role:change',
  USER_RESTORE: 'user:restore',
  USER_CREDENTIALS: 'user:credentials',
  // Offers
  OFFER_READ: 'offer:read',
  OFFER_MANAGE: 'offer:manage',
  OFFER_APPROVE: 'offer:approve',
  // Compensation / payroll
  TEMPLATE_MANAGE: 'template:manage',
  SALARY_ASSIGN: 'salary:assign',
  PAYROLL_RUN: 'payroll:run',
  PAYROLL_READ: 'payroll:read',
  // Documents
  DOCUMENT_VERIFY: 'document:verify',
  DOCUMENT_READ_ANY: 'document:read:any',
  DOCTYPE_MANAGE: 'doctype:manage',
  EMPLOYEE_DOC_ISSUE: 'employeedoc:issue',
  // Dashboard
  DASHBOARD_READ: 'dashboard:read',
  // Company config
  COMPANY_MANAGE: 'company:manage',
  // Attendance & leave
  ATTENDANCE_MANAGE: 'attendance:manage',
  LEAVE_APPROVE: 'leave:approve',
  HOLIDAY_MANAGE: 'holiday:manage',
  // Performance & training
  PERFORMANCE_MANAGE: 'performance:manage',
  TRAINING_MANAGE: 'training:manage',
  // Assets
  ASSET_MANAGE: 'asset:manage',
  // Exit
  EXIT_MANAGE: 'exit:manage',
  // Platform
  TENANT_MANAGE: 'tenant:manage',

  // --- Mobile field-force (business-ops app) ---
  // Day-to-day field-force capabilities are gated by `fieldForce.tier` (see
  // middleware/fieldForceAuth.js), not by these role-based permissions. These
  // permission entries exist so admin/superadmin (who hold '*'/ADMIN already)
  // get automatic, explicit company-wide field-ops access without needing a
  // fieldForce.tier of their own.
  ATTENDANCE_PUNCH: 'attendance:punch',
  DOCTOR_VIEW: 'doctor:view',
  DOCTOR_MANAGE: 'doctor:manage',
  DCR_SUBMIT: 'dcr:submit',
  MTP_SUBMIT: 'mtp:submit',
  MTP_APPROVE: 'mtp:approve',
  EXPENSE_SUBMIT: 'expense:submit',
  EXPENSE_APPROVE: 'expense:approve',
  FIELDCALL_LOG: 'fieldcall:log',
  WORKTYPE_LOG: 'worktype:log',
  STOCKIST_MANAGE: 'stockist:manage',
  FIELDOPS_MONITOR: 'fieldops:monitor'
};

const ALL = Object.values(PERMISSIONS);

// HR = day-to-day HR operations, minus sensitive/irreversible + company config.
const HR = [
  PERMISSIONS.USER_READ, PERMISSIONS.USER_CREATE, PERMISSIONS.USER_UPDATE, PERMISSIONS.USER_CREDENTIALS,
  PERMISSIONS.OFFER_READ, PERMISSIONS.OFFER_MANAGE, PERMISSIONS.OFFER_APPROVE,
  PERMISSIONS.TEMPLATE_MANAGE, PERMISSIONS.SALARY_ASSIGN, PERMISSIONS.PAYROLL_RUN, PERMISSIONS.PAYROLL_READ,
  PERMISSIONS.DOCUMENT_VERIFY, PERMISSIONS.DOCUMENT_READ_ANY, PERMISSIONS.DOCTYPE_MANAGE, PERMISSIONS.EMPLOYEE_DOC_ISSUE,
  PERMISSIONS.DASHBOARD_READ,
  PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.HOLIDAY_MANAGE,
  PERMISSIONS.PERFORMANCE_MANAGE, PERMISSIONS.TRAINING_MANAGE,
  PERMISSIONS.EXIT_MANAGE
];

// Admin = full company scope (everything except platform tenant management).
const ADMIN = ALL.filter((p) => p !== PERMISSIONS.TENANT_MANAGE);

export const ROLE_PERMISSIONS = {
  superadmin: ['*'],
  admin: ADMIN,
  hr: HR,
  employee: []
};

/** True if `role` is granted `permission` (wildcard-aware). */
export const roleHasPermission = (role, permission) => {
  const grants = ROLE_PERMISSIONS[role] || [];
  return grants.includes('*') || grants.includes(permission);
};
