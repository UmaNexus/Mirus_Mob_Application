import asyncHandler from '../utils/asyncHandler.js';
import User from '../models/User.js';
import { FIELD_TIERS } from '../config/fieldForce.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';

const TEAM_SELECT = '_id email personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce employeeDetails.reportingManagerId';

/**
 * GET /api/field-force/team
 *
 * Returns the field-force personnel the caller is authorized to see:
 *  - admin/superadmin (company-wide field-ops access): every field-force user
 *    in the company (tenant-scoped automatically by the tenantScope plugin).
 *  - a tiered field-force user (BDM..NSM): themselves plus everyone in their
 *    reporting subtree (own data only for a BDM, since a BDM has no reports).
 *
 * This is the first concrete consumer of the Domain 1 authorization
 * scaffolding — every later field-force domain (Doctor, DCR, MTP, ...) reuses
 * the same `hasCompanyWideFieldOpsAccess` / `buildReportingSubtreeIds`
 * building blocks for its own "my team's data" queries.
 */
export const listFieldForceTeam = asyncHandler(async (req, res) => {
  if (hasCompanyWideFieldOpsAccess(req.user)) {
    const data = await User.find({ 'employeeDetails.fieldForce.tier': { $in: FIELD_TIERS } })
      .select(TEAM_SELECT)
      .limit(1000);
    return res.status(200).json({ success: true, scope: 'company', data });
  }

  const subtreeIds = await buildReportingSubtreeIds(req.user._id);
  const ids = [String(req.user._id), ...subtreeIds];
  const data = await User.find({ _id: { $in: ids } }).select(TEAM_SELECT);
  res.status(200).json({ success: true, scope: 'subtree', data });
});
