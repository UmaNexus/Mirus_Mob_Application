/**
 * Field-force sales hierarchy (mobile business-ops app).
 *
 * This is a *separate* dimension from the HRMS `User.role` (superadmin/admin/
 * hr/employee), which continues to govern HRMS permissions unchanged. A field
 * rep is still `role: 'employee'` for payroll/leave/attendance purposes, and
 * additionally carries a `fieldForce.tier` describing their place in the sales
 * hierarchy. Keeping these separate avoids conflating "what HR operations can
 * this person do" with "what tier of the sales org is this person."
 *
 * Ranks are ordered lowest → highest so `tierAtLeast` can compare them.
 */
export const FIELD_TIERS = ['BDM', 'ASM', 'RSM', 'ZSM', 'NSM'];

export const FIELD_TIER_LABELS = {
  BDM: 'Business Development Manager',
  ASM: 'Area Sales Manager',
  RSM: 'Regional Sales Manager',
  ZSM: 'Zonal Sales Manager',
  NSM: 'National Sales Manager'
};

const FIELD_TIER_RANK = FIELD_TIERS.reduce((acc, tier, idx) => {
  acc[tier] = idx + 1;
  return acc;
}, {});

export const isValidFieldTier = (tier) => FIELD_TIERS.includes(tier);

export const tierRank = (tier) => FIELD_TIER_RANK[tier] || 0;

/** True if `tier` is at or above `minTier` in the hierarchy (BDM lowest, NSM highest). */
export const tierAtLeast = (tier, minTier) => tierRank(tier) >= tierRank(minTier);
