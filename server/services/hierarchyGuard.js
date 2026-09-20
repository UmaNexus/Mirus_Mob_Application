import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { REQUIRED_MANAGER_TIER } from '../config/fieldForce.js';
import { wouldCreateCycle } from '../middleware/fieldForceAuth.js';

const displayName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

const MANAGER_SELECT = 'personalDetails email role isActive deletedAt employeeDetails.fieldForce.tier';

/** True if `manager` is a valid parent for someone whose field-force tier is `tier` (no strict constraint when `tier` is null/none). */
export const managerSatisfiesTier = (tier, manager) => {
  if (!tier) return true;
  const requiredParentTier = REQUIRED_MANAGER_TIER[tier];
  if (requiredParentTier === null) return manager.role === 'admin' || manager.role === 'superadmin';
  return manager.employeeDetails?.fieldForce?.tier === requiredParentTier;
};

/**
 * Re-looks-up and fully validates a candidate reporting manager for a user
 * whose effective field-force tier is `tier` — never trusts the
 * client-supplied id at face value. Throws ApiError(400) on: self-reference,
 * not found / soft-deleted (a cross-company id simply never resolves here —
 * the `tenantScope` plugin already confines the lookup to the caller's own
 * company), inactive, wrong tier for the strict Admin→NSM→ZSM→RSM→ASM→BDM
 * hierarchy, or a would-be circular reporting relationship. Returns the
 * manager doc on success.
 */
export const assertValidManager = async ({ targetUserId, tier, candidateManagerId, session = null }) => {
  if (String(candidateManagerId) === String(targetUserId)) {
    throw new ApiError(400, 'A user cannot be their own reporting manager');
  }
  const manager = await User.findById(candidateManagerId).select(MANAGER_SELECT).session(session);
  if (!manager || manager.deletedAt) throw new ApiError(400, 'Invalid reporting manager');
  if (!manager.isActive) throw new ApiError(400, 'Cannot assign an inactive user as a reporting manager');

  if (!managerSatisfiesTier(tier, manager)) {
    const requiredParentTier = REQUIRED_MANAGER_TIER[tier];
    const gotLabel = manager.employeeDetails?.fieldForce?.tier || manager.role;
    throw new ApiError(
      400,
      requiredParentTier === null
        ? `An NSM must report to an Admin — "${gotLabel}" is not valid`
        : `A ${tier} must report to a ${requiredParentTier} — got "${gotLabel}"`
    );
  }

  if (await wouldCreateCycle(targetUserId, candidateManagerId)) {
    throw new ApiError(400, 'This reporting-manager assignment would create a circular reporting relationship');
  }
  return manager;
};

/**
 * When `userId`'s field-force tier changes from `oldTier` to `newTier`,
 * finds every EXISTING direct report whose relationship to `userId` WAS
 * valid under `oldTier` but is NO LONGER valid under `newTier` — this is the
 * actual hierarchy-integrity bug being closed: an ASM silently promoted to
 * RSM must not leave their existing BDM direct reports attached to an RSM
 * (BDM requires an ASM parent). A relationship that was ALREADY invalid
 * before this change (a pre-existing, unrelated data issue) is deliberately
 * NOT flagged here — only what this specific change newly breaks, so
 * same-tier manager REPLACEMENT (a different operation entirely) is
 * completely unaffected by this check.
 */
export const findNewlyBrokenDirectReports = async ({ userId, oldTier, newTier, session = null }) => {
  if (oldTier === newTier) return [];
  const directReports = await User.find({ 'employeeDetails.reportingManagerId': userId, deletedAt: null })
    .select('personalDetails email employeeDetails.employeeId employeeDetails.fieldForce.tier')
    .session(session);

  return directReports
    .map((report) => ({ report, reportTier: report.employeeDetails?.fieldForce?.tier || null }))
    .filter(({ reportTier }) => reportTier) // no tier of their own => no strict parent-tier constraint, never "affected"
    .filter(({ reportTier }) => {
      const requiredParentTier = REQUIRED_MANAGER_TIER[reportTier];
      if (requiredParentTier === null) return false; // an NSM-tier report's required parent is "an Admin" — independent of this manager's own tier
      return requiredParentTier === oldTier && requiredParentTier !== newTier;
    })
    .map(({ report, reportTier }) => ({
      id: String(report._id),
      name: displayName(report),
      employeeId: report.employeeDetails?.employeeId || null,
      tier: reportTier,
      requiredManagerTier: REQUIRED_MANAGER_TIER[reportTier]
    }));
};
