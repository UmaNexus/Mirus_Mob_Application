import mongoose from 'mongoose';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { withOptionalTransaction } from '../utils/withOptionalTransaction.js';
import { buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';
import { FIELD_TIERS, MANAGER_TIERS } from '../config/fieldForce.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../config/permissions.js';

const HIERARCHY_SELECT = 'personalDetails.firstName personalDetails.lastName email role isActive '
  + 'employeeDetails.employeeId employeeDetails.department employeeDetails.designation '
  + 'employeeDetails.fieldForce employeeDetails.reportingManagerId';

const displayName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

/**
 * GET /api/admin/hierarchy — the whole organization tree for the Admin
 * Dashboard (Admin → NSM → ZSM → RSM → ASM → BDM), built from the SAME
 * `employeeDetails.reportingManagerId` links every other field-force feature
 * already reads/writes — no separate hierarchy collection.
 *
 * HRMS onboarding and field-force hierarchy assignment are deliberately
 * separate concerns (onboarding creates the User; an Admin separately opts
 * them into this hierarchy) — so eligibility here is NEVER *only* "already
 * has a fieldForce.tier". That would silently hide every freshly onboarded
 * employee (tier/reportingManagerId both null) from the Admin Dashboard
 * entirely, with no way to ever assign them one. Eligibility is therefore
 * the union of two independent signals:
 *  - already has a real fieldForce.tier — included unconditionally,
 *    regardless of isActive/employeeId, so an existing assigned user's
 *    behavior never changes (this was the *entire* original filter);
 *  - OR is a real, fully provisioned employee eligible for FUTURE
 *    assignment — the same "employeesOnly" signal `listUsers` already uses:
 *    role 'employee' (field reps are never role admin/hr — see
 *    config/fieldForce.js), active, with a real employeeId (onboarding
 *    complete, not still a draft candidate).
 * `fieldForce.tier` is never inferred from `designation`/`department` —
 * those are shown for context only. Admin/superadmin are always included
 * for the tree's root.
 *
 * Every read is implicitly tenant-scoped (the `tenantScope` plugin), so this
 * can never surface another company's org chart.
 */
export const getHierarchy = asyncHandler(async (req, res) => {
  const users = await User.find({
    deletedAt: null,
    $or: [
      { role: { $in: ['admin', 'superadmin'] } },
      { 'employeeDetails.fieldForce.tier': { $in: FIELD_TIERS } },
      {
        role: 'employee',
        isActive: true,
        'employeeDetails.employeeId': { $exists: true, $nin: [null, ''] }
      }
    ]
  })
    .select(HIERARCHY_SELECT)
    .sort({ 'personalDetails.firstName': 1 })
    .lean();

  const byId = new Map(users.map((u) => [String(u._id), { ...u, children: [] }]));
  const roots = [];
  const unassigned = [];

  for (const node of byId.values()) {
    if (node.role === 'admin' || node.role === 'superadmin') {
      roots.push(node);
      continue;
    }
    if (!node.employeeDetails?.fieldForce?.tier) {
      // Onboarded, but an Admin hasn't opted them into the field-force
      // hierarchy yet — never inferred from designation/department.
      unassigned.push(node);
      continue;
    }
    const managerId = node.employeeDetails?.reportingManagerId ? String(node.employeeDetails.reportingManagerId) : null;
    if (managerId && byId.has(managerId)) {
      byId.get(managerId).children.push(node);
    }
  }

  // Anyone with a real field-force tier whose reporting chain doesn't
  // resolve up to an Admin in this same set (no manager on file yet, or one
  // pointing outside this filtered list) — surfaced separately so the Admin
  // Dashboard can flag it for correction instead of silently hiding a real
  // user or guessing where to attach them. Distinct from `unassigned` above
  // — this is "has a tier but a broken chain", not "never assigned a tier".
  const attached = new Set();
  const collect = (node) => { attached.add(String(node._id)); node.children.forEach(collect); };
  roots.forEach(collect);
  const unattached = users.filter((u) => {
    const id = String(u._id);
    return u.employeeDetails?.fieldForce?.tier && !attached.has(id) && u.role !== 'admin' && u.role !== 'superadmin';
  });

  res.status(200).json({ success: true, data: { roots, unassigned, unattached } });
});

/**
 * GET /api/admin/permissions — read-only catalog of the existing permission
 * system (config/permissions.js) for the Admin Dashboard's permissions view.
 * Deliberately does not introduce a per-user permission-override mechanism —
 * permissions remain purely role-derived, exactly as today; this endpoint
 * only exposes that existing mapping to the UI so an admin can see what a
 * role — and therefore a user assigned that role — actually grants.
 */
export const getPermissionsCatalog = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { permissions: PERMISSIONS, rolePermissions: ROLE_PERMISSIONS } });
});

/**
 * POST /api/admin/hierarchy/replace-manager — { oldManagerId, newManagerId }
 *
 * Re-parents every DIRECT report of `oldManagerId` to `newManagerId`,
 * preserving the rest of the subtree exactly as-is (a BDM's own
 * `reportingManagerId` never changes unless the BDM itself was a direct
 * report of the manager being replaced). Nothing outside
 * `employeeDetails.reportingManagerId` on the affected direct reports is
 * touched — doctors, DCRs, MTPs, expenses, attendance, and every other
 * business record keeps referencing its real original `userId`/owner
 * untouched, since this only ever updates the reporting-manager link.
 *
 * `newManagerId` must already hold the exact same field-force tier as
 * `oldManagerId` — replacing a position means someone already sized for
 * that position takes it over; promoting/re-tiering someone is a separate,
 * explicit role-assignment action (PUT /api/users/:id) done beforehand.
 *
 * Runs inside a transaction when the MongoDB deployment supports one, so
 * the organization can never be observed half-reparented.
 */
export const replaceManager = asyncHandler(async (req, res) => {
  const { oldManagerId, newManagerId } = req.body;
  if (!mongoose.isValidObjectId(oldManagerId) || !mongoose.isValidObjectId(newManagerId)) {
    throw new ApiError(400, 'oldManagerId and newManagerId must be valid ids');
  }
  if (String(oldManagerId) === String(newManagerId)) {
    throw new ApiError(400, 'The replacement manager must be a different user from the manager being replaced');
  }

  const result = await withOptionalTransaction(async (session) => {
    const [oldManager, newManager] = await Promise.all([
      User.findById(oldManagerId).select('personalDetails employeeDetails.fieldForce role deletedAt').session(session),
      User.findById(newManagerId).select('personalDetails employeeDetails.fieldForce role deletedAt').session(session)
    ]);
    if (!oldManager || oldManager.deletedAt) throw new ApiError(404, 'Manager being replaced was not found');
    if (!newManager || newManager.deletedAt) throw new ApiError(404, 'Replacement manager was not found');

    const oldTier = oldManager.employeeDetails?.fieldForce?.tier;
    const newTier = newManager.employeeDetails?.fieldForce?.tier;
    if (!oldTier || !MANAGER_TIERS.includes(oldTier)) {
      throw new ApiError(400, 'Only an ASM, RSM, ZSM, or NSM position can be replaced');
    }
    if (newTier !== oldTier) {
      throw new ApiError(400, `The replacement manager must already hold the "${oldTier}" tier (currently "${newTier || 'none'}") — assign the tier first, then replace`);
    }

    // The replacement must not already be a descendant of the position
    // being replaced — attaching a manager's own reports to their own
    // descendant would create a cycle once combined with the re-parenting
    // below.
    const oldSubtree = await buildReportingSubtreeIds(oldManagerId);
    if (oldSubtree.has(String(newManagerId))) {
      throw new ApiError(400, 'The replacement manager cannot be one of the current manager\'s own descendants');
    }

    const directReports = await User.find({ 'employeeDetails.reportingManagerId': oldManagerId })
      .select('_id personalDetails employeeDetails.employeeId employeeDetails.fieldForce.tier')
      .session(session);

    const updateResult = await User.updateMany(
      { 'employeeDetails.reportingManagerId': oldManagerId },
      { $set: { 'employeeDetails.reportingManagerId': newManagerId } }
    ).session(session);

    await logActivity({
      actor: req.user,
      action: 'admin.hierarchy.replaceManager',
      entityType: 'User',
      entityId: newManagerId,
      message: `${displayName(newManager)} replaced ${displayName(oldManager)} as ${oldTier} — ${updateResult.modifiedCount} direct report(s) re-parented`,
      meta: { oldManagerId: String(oldManagerId), newManagerId: String(newManagerId), tier: oldTier, reparentedCount: updateResult.modifiedCount }
    });

    return {
      tier: oldTier,
      oldManager: { id: oldManager._id, name: displayName(oldManager) },
      newManager: { id: newManager._id, name: displayName(newManager) },
      reparentedCount: updateResult.modifiedCount,
      reparented: directReports.map((u) => ({ id: u._id, name: displayName(u), employeeId: u.employeeDetails?.employeeId || null, tier: u.employeeDetails?.fieldForce?.tier || null }))
    };
  });

  res.status(200).json({ success: true, message: 'Manager replaced', data: result });
});
