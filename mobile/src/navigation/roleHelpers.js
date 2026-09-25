/**
 * Resolve a display label for the authenticated user's field-force tier
 * (NSM/ZSM/RSM/ASM/BDM) or HRMS role (admin/superadmin). Actual per-tier
 * navigator trees (BDM tab bar, Manager tab bar, Admin tab bar) are built in
 * Milestones 6-8 — this foundation only needs to know which one to route to.
 *
 * The tier/role are read exclusively from what the server returned on
 * `user` at login/session-restore — never inferred or chosen client-side.
 */
export const resolveUserTier = (user) => {
  if (!user) return null;
  if (user.role === 'admin' || user.role === 'superadmin') return 'ADMIN';
  return user.employeeDetails?.fieldForce?.tier || null;
};

export const displayName = (user) => {
  const first = user?.personalDetails?.firstName || '';
  const last = user?.personalDetails?.lastName || '';
  return `${first} ${last}`.trim() || user?.email || 'User';
};

/**
 * True for anyone who can reach the manager-side doctor-assignment / MTP
 * review screens: admin/superadmin (company-wide field-ops access via their
 * HRMS role) or a tiered manager (ASM and above). This is a client-side
 * routing convenience only — every underlying endpoint re-checks the same
 * authorization server-side (requireFieldCapability / canAccessFieldOpsUser),
 * so hiding a button here is never the actual security boundary.
 */
export const isManagerTier = (user) => {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return ['ASM', 'RSM', 'ZSM', 'NSM'].includes(user.employeeDetails?.fieldForce?.tier);
};

/**
 * True for the two executive, cross-tier MONITORING roles — NSM (whose
 * scope is their whole ZSM->RSM->ASM->BDM subtree) and Admin/superadmin
 * (company-wide). These get their own tab navigator (`ExecutiveTabNavigator`)
 * instead of the operational ASM/RSM/ZSM "my direct-report BDMs" experience —
 * see `RootNavigator`. Every underlying endpoint re-checks this server-side
 * (`requireFieldCapability`), so this is a routing convenience only.
 */
export const isExecutiveTier = (user) => {
  const tier = resolveUserTier(user);
  return tier === 'NSM' || tier === 'ADMIN';
};
