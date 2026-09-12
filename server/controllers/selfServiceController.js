import User from '../models/User.js';
import SalarySlip from '../models/SalarySlip.js';
import asyncHandler from '../utils/asyncHandler.js';
import { formatINR } from '../utils/money.js';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

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
    });

  const latest = await SalarySlip.findOne({ employeeId: user._id }).sort({ year: -1, month: -1 });
  const docs = user.uploadedDocuments || [];
  const manager = user.employeeDetails?.reportingManagerId;

  res.status(200).json({
    success: true,
    profile: {
      fullName: `${user.personalDetails.firstName} ${user.personalDetails.lastName}`,
      avatarUrl: user.personalDetails.profilePictureUrl,
      designation: user.employeeDetails?.designation || null,
      employeeId: user.employeeDetails?.employeeId || null,
      department: user.employeeDetails?.department || null,
      status: user.isActive ? 'Active Employee' : 'Inactive',
      reportingManager: manager
        ? `${manager.personalDetails.firstName} ${manager.personalDetails.lastName}`
        : null
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
