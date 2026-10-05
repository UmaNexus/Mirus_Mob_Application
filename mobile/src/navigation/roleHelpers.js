
export const isAdminUser = (user) => user?.role === 'admin' || user?.role === 'superadmin';

/** Display label for the user's role: 'Admin' for admin/superadmin, else the JobRole name, else null. */
export const roleLabel = (user) => {
  if (!user) return null;
  if (isAdminUser(user)) return 'Admin';
  return user.fieldAccess?.roleName || null;
};

/** Role name of ANY user object returned by the API (approver, participant, team member). Null if none. */
export const roleNameOf = (u) => {
  if (!u) return null;
  if (isAdminUser(u)) return 'Admin';
  return u.roleName || u.jobRole?.name || u.employeeDetails?.jobRole?.name || null;
};

export const displayName = (user) => {
  const first = user?.personalDetails?.firstName || '';
  const last = user?.personalDetails?.lastName || '';
  return `${first} ${last}`.trim() || user?.email || 'User';
};

/** May enter the field-force app at all: admin/superadmin, or a server-confirmed field role. */
export const hasFieldAccess = (user) => Boolean(user) && (isAdminUser(user) || Boolean(user.fieldAccess?.isFieldUser));

/** Admin/superadmin or a server-flagged manager-capability role. */
export const isManagerTier = (user) => Boolean(user) && (isAdminUser(user) || Boolean(user.fieldAccess?.isManager));

/** Admin/superadmin or a server-flagged executive role (monitoring navigator). */
export const isExecutiveTier = (user) => Boolean(user) && (isAdminUser(user) || Boolean(user.fieldAccess?.isExecutive));

/** A field rep (leaf role): a field role that is not a manager role. Never true for admins. */
export const isLeafUser = (user) => Boolean(user) && !isAdminUser(user) && Boolean(user.fieldAccess?.isFieldUser) && !user.fieldAccess?.isManager;
