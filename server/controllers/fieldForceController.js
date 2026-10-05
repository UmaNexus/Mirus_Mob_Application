import asyncHandler from '../utils/asyncHandler.js';
import User from '../models/User.js';
import { fieldUserFilter, JOB_ROLE_POPULATE, roleOf, publicJobRole } from '../services/fieldIdentity.js';

// Adds server-derived role fields so clients never infer position from role names.
const withRoleInfo = (users) => users.map((u) => {
  const r = roleOf(u);
  return { ...u.toObject(), jobRole: publicJobRole(u), roleName: r.name, roleCode: r.code, isLeaf: r.isLeaf, isManager: r.isManager };
});
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';

const TEAM_SELECT = '_id email isActive personalDetails.firstName personalDetails.lastName employeeDetails.jobRole employeeDetails.reportingManagerId employeeDetails.employeeId';

/**
 * GET /api/field-force/team
 *
 * Returns the field-force personnel the caller is authorized to see:
 *  - admin/superadmin (company-wide field-ops access): every field-force user
 *    in the company (tenant-scoped automatically by the tenantScope plugin).
 *  - a field-force JobRole holder: themselves plus everyone in their
 *    reporting subtree (own data only for a BDM, since a BDM has no reports).
 *
 * This is the first concrete consumer of the Domain 1 authorization
 * scaffolding — every later field-force domain (Doctor, DCR, MTP, ...) reuses
 * the same `hasCompanyWideFieldOpsAccess` / `buildReportingSubtreeIds`
 * building blocks for its own "my team's data" queries.
 */
export const listFieldForceTeam = asyncHandler(async (req, res) => {
  if (hasCompanyWideFieldOpsAccess(req.user)) {
    const data = await User.find(await fieldUserFilter())
      .select(TEAM_SELECT)
      .populate(JOB_ROLE_POPULATE)
      .limit(1000);
    return res.status(200).json({ success: true, scope: 'company', data: withRoleInfo(data) });
  }

  const subtreeIds = await buildReportingSubtreeIds(req.user._id);
  const ids = [String(req.user._id), ...subtreeIds];
  const data = await User.find({ _id: { $in: ids } }).select(TEAM_SELECT).populate(JOB_ROLE_POPULATE);
  res.status(200).json({ success: true, scope: 'subtree', data: withRoleInfo(data) });
});
