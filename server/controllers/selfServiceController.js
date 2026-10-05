import User from '../models/User.js';
import SalarySlip from '../models/SalarySlip.js';
import asyncHandler from '../utils/asyncHandler.js';
import { formatINR } from '../utils/money.js';
import { buildReportingChainAbove } from '../middleware/fieldForceAuth.js';
import { JOB_ROLE_POPULATE, publicJobRole, roleOf } from '../services/fieldIdentity.js';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const chainMemberName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email;

/**
 * GET /api/self-service/overview — US 7.1
 * Curated landing-page payload: identity card, reporting line, onboarding
 * progress, latest payslip summary, and document status counts.
 */
export const getHubOverview = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password -passwordSetup')
    .populate({
      path: 'employeeDetails.reportingManagerId',
      select: 'personalDetails.firstName personalDetails.lastName employeeDetails.designation'
    })
    .populate(JOB_ROLE_POPULATE);

  const latest = await SalarySlip.findOne({ employeeId: user._id }).sort({ year: -1, month: -1 });
  const docs = user.uploadedDocuments || [];
  const manager = user.employeeDetails?.reportingManagerId;

  // Full upward reporting chain (immediate manager -> ... -> Admin/root),
  // not just the one-level `reportingManager` string above. Reuses the same
  // `employeeDetails.reportingManagerId` walk the mobile field-force
  // joint-call eligibility check already uses (buildReportingChainAbove) —
  // it works for ANY employee (tiered or not), is already tenant-scoped (the
  // request's tenant context, not a client-supplied id), and already stops
  // safely on a circular relationship instead of looping forever. This is
  // the employee's own upward chain, never a manager's downward subtree.
  const chainIds = [...(await buildReportingChainAbove(user._id))];
  const chainUsers = chainIds.length
    ? await User.find({ _id: { $in: chainIds } })
      .select('personalDetails.firstName personalDetails.lastName email role employeeDetails.employeeId employeeDetails.designation employeeDetails.jobRole')
      .populate(JOB_ROLE_POPULATE)
      .lean()
    : [];
  const chainById = new Map(chainUsers.map((u) => [String(u._id), u]));
  const reportingChain = chainIds
    .map((id) => chainById.get(id))
    .filter(Boolean)
    .map((u) => ({
      id: u._id,
      name: chainMemberName(u),
      employeeId: u.employeeDetails?.employeeId || null,
      designation: u.employeeDetails?.designation || null,
      role: u.role,
      jobRole: publicJobRole(u),
      roleName: roleOf(u).name
    }));

  res.status(200).json({
    success: true,
    profile: {
      fullName: `${user.personalDetails.firstName} ${user.personalDetails.lastName}`,
      avatarUrl: user.personalDetails.profilePictureUrl,
      designation: user.employeeDetails?.designation || null,
      employeeId: user.employeeDetails?.employeeId || null,
      department: user.employeeDetails?.department || null,
      status: user.isActive ? 'Active Employee' : 'Inactive',
      jobRole: publicJobRole(user),
      roleName: roleOf(user).name,
      reportingManager: manager
        ? `${manager.personalDetails.firstName} ${manager.personalDetails.lastName}`
        : null,
      reportingChain
    },
    onboarding: { stage: user.onboardingStage },
    latestPayslip: latest
      ? {
          id: latest._id,
          period: `${MONTHS[latest.month]} ${latest.year}`,
          netPay: latest.financialSummary.netPay,
          netPayDisplay: formatINR(latest.financialSummary.netPay),
          downloadUrl: `/api/payslips/${latest._id}/pdf`
        }
      : null,
    documents: {
      total: docs.length,
      verified: docs.filter((d) => d.verificationStatus === 'Verified').length,
      pending: docs.filter((d) => d.verificationStatus === 'Pending').length
    }
  });
});
