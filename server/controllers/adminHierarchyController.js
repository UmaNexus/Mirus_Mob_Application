import mongoose from 'mongoose';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { withOptionalTransaction } from '../utils/withOptionalTransaction.js';
import { buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';
import { findInvalidRelationships } from '../services/hierarchyGuard.js';
import { JOB_ROLE_POPULATE, roleOf, publicJobRole, hasDirectReports } from '../services/fieldIdentity.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../config/permissions.js';
import { dispatchNotification } from '../services/notificationService.js';

const HIERARCHY_SELECT = 'personalDetails.firstName personalDetails.lastName email role isActive '
  + 'employeeDetails.employeeId employeeDetails.department employeeDetails.designation '
  + 'employeeDetails.jobRole employeeDetails.reportingManagerId employeeDetails.workLocation';

const displayName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

/**
 * GET /api/admin/hierarchy — the whole organization tree for the Admin
 * Dashboard (Admin → job-role holders), built from the SAME
 * `employeeDetails.reportingManagerId` links every other field-force feature
 * already reads/writes — no separate hierarchy collection.
 *
 * HRMS onboarding and field-force hierarchy assignment are deliberately
 * separate concerns (onboarding creates the User; an Admin separately opts
 * them into this hierarchy) — so eligibility here is NEVER *only* "already
 * has a jobRole". That would silently hide every freshly onboarded
 * employee (jobRole/reportingManagerId both null) from the Admin Dashboard
 * entirely, with no way to ever assign them one. Eligibility is therefore
 * the union of two independent signals:
 *  - already holds a JobRole — included unconditionally,
 *    regardless of isActive/employeeId;
 *  - OR is a real, fully provisioned employee eligible for FUTURE
 *    assignment — the same "employeesOnly" signal `listUsers` already uses:
 *    role 'employee', active, with a real employeeId (onboarding
 *    complete, not still a draft candidate).
 * A JobRole is never inferred from `designation`/`department` —
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
      { 'employeeDetails.jobRole': { $ne: null } },
      {
        role: 'employee',
        isActive: true,
        'employeeDetails.employeeId': { $exists: true, $nin: [null, ''] }
      }
    ]
  })
    .select(HIERARCHY_SELECT)
    .populate(JOB_ROLE_POPULATE)
    .sort({ 'personalDetails.firstName': 1 })
    .lean();

  // Every node carries its resolved role (JobRole name) and a public {id,name} jobRole —
  // never an error when absent.
  const byId = new Map(users.map((u) => [String(u._id), { ...u, roleName: roleOf(u).name, jobRole: publicJobRole(u), children: [] }]));
  const roots = [];
  const unassigned = [];

  for (const node of byId.values()) {
    if (node.role === 'admin' || node.role === 'superadmin') {
      roots.push(node);
      continue;
    }
    if (!roleOf(node).hasJobRole) {
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

  // Anyone holding a JobRole whose reporting chain doesn't
  // resolve up to an Admin in this same set (no manager on file yet, or one
  // pointing outside this filtered list) — surfaced separately so the Admin
  // Dashboard can flag it for correction instead of silently hiding a real
  // user or guessing where to attach them. Distinct from `unassigned` above
  // — this is "has a role but a broken chain", not "never assigned a role".
  const attached = new Set();
  const collect = (node) => { attached.add(String(node._id)); node.children.forEach(collect); };
  roots.forEach(collect);
  const unattached = users
    .filter((u) => {
      const id = String(u._id);
      return roleOf(u).hasJobRole && !attached.has(id) && u.role !== 'admin' && u.role !== 'superadmin';
    })
    // Same role fields as every tree node, so the UI shows the real JobRole even with no manager.
    .map((u) => ({ ...u, roleName: roleOf(u).name, jobRole: publicJobRole(u) }));

  // READ-ONLY audit: stored relationships that break the hierarchy rule. Nothing is rewritten.
  const invalidRelationships = findInvalidRelationships(users).map((r) => ({
    ...r,
    name: displayName(byId.get(r.userId) || {}),
    managerName: displayName(byId.get(r.managerId) || {})
  }));
  const invalidIds = new Set(invalidRelationships.map((r) => r.userId));
  byId.forEach((node, id) => { if (invalidIds.has(id)) node.hierarchyIssue = invalidRelationships.find((r) => r.userId === id); });

  res.status(200).json({ success: true, data: { roots, unassigned, unattached, invalidRelationships } });
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
 * `newManagerId` must already hold the exact same JobRole as `oldManagerId` —
 * replacing a position means someone already in that role takes it over;
 * changing someone's role is a separate, explicit role-assignment action
 * (PUT /api/users/:id with `jobRoleId`) done beforehand.
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
      User.findById(oldManagerId).select('personalDetails employeeDetails.jobRole role deletedAt').populate(JOB_ROLE_POPULATE).session(session),
      User.findById(newManagerId).select('personalDetails employeeDetails.jobRole role deletedAt').populate(JOB_ROLE_POPULATE).session(session)
    ]);
    if (!oldManager || oldManager.deletedAt) throw new ApiError(404, 'Manager being replaced was not found');
    if (!newManager || newManager.deletedAt) throw new ApiError(404, 'Replacement manager was not found');

    const oldRole = roleOf(oldManager);
    const newRole = roleOf(newManager);
    // The manager position is whatever the real reporting graph says (someone with
    // direct reports), and the replacement must hold the SAME JobRole.
    if (!oldRole.hasJobRole || !(await hasDirectReports(oldManagerId))) {
      throw new ApiError(400, 'Only a manager position (someone with direct reports) can be replaced');
    }
    if (!newRole.hasJobRole || newRole.jobRoleId !== oldRole.jobRoleId) {
      throw new ApiError(400, `The replacement manager must already hold the same role as the manager being replaced ("${oldRole.name}") — assign the role first, then replace`);
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
      .select('_id personalDetails employeeDetails.employeeId')
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
      message: `${displayName(newManager)} replaced ${displayName(oldManager)} as ${oldRole.name} — ${updateResult.modifiedCount} direct report(s) re-parented`,
      meta: { oldManagerId: String(oldManagerId), newManagerId: String(newManagerId), roleName: oldRole.name, reparentedCount: updateResult.modifiedCount }
    });

    return {
      roleName: oldRole.name,
      oldManager: { id: oldManager._id, name: displayName(oldManager) },
      newManager: { id: newManager._id, name: displayName(newManager) },
      reparentedCount: updateResult.modifiedCount,
      reparented: directReports.map((u) => ({ id: u._id, name: displayName(u), employeeId: u.employeeDetails?.employeeId || null }))
    };
  });

  if (result?.reparented?.length > 0) {
    const reportIds = result.reparented.map((r) => r.id);
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: reportIds,
      senderId: req.user._id,
      module: 'hierarchy',
      eventId: 'MANAGER_REPLACED_NOTIFICATION',
      title: 'Reporting Hierarchy Update',
      body: `${result.newManager.name} is now your reporting manager. All pending requests reassigned.`,
      priority: 'high',
      deepLink: 'mirus://bdm/home',
      entityType: 'User',
      entityId: result.newManager.id,
      data: { screen: 'BdmHomeScreen', newManagerId: result.newManager.id }
    }).catch(() => {});
  }

  res.status(200).json({ success: true, message: 'Manager replaced', data: result });
});
