/**
 * Display label for a user returned by the API: Admin for admin/superadmin, else the
 * server-resolved JobRole name (`roleName` / `jobRole.name`). Display only; never used for access.
 */
export const roleLabelOf = (u) => {
  if (!u) return null;
  if (u.role === 'admin' || u.role === 'superadmin') return 'Admin';
  return u.roleName || u.jobRole?.name || null;
};

/** Stable identity used to group "same role" users: the JobRole id. */
export const roleKeyOf = (u) => u?.jobRole?.id || null;
