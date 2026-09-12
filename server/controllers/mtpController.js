import mongoose from 'mongoose';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';

const EDITABLE_STATUSES = ['draft', 'rejected', 'withdrawn'];

/** GET /api/mtp?month=YYYY-MM — the caller's own MTP(s). Own record only (ownership). */
export const listMyMtp = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.month) filter.month = String(req.query.month);
  const plans = await MonthlyTourPlan.find(filter).sort({ month: -1 });
  res.status(200).json({ success: true, data: plans });
});

/**
 * POST /api/mtp — create or edit the caller's own MTP draft for a month.
 * Editable only while draft/rejected/withdrawn — a pending/approved plan must
 * be withdrawn (or decided) before it can be changed again.
 */
export const upsertMtp = asyncHandler(async (req, res) => {
  const { month, plannedVisits, remarks } = req.body;

  let plan = await MonthlyTourPlan.findOne({ userId: req.user._id, month });
  if (plan && !EDITABLE_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `MTP for ${month} is ${plan.status} and cannot be edited directly — withdraw it first`);
  }

  if (!plan) {
    plan = await MonthlyTourPlan.create({ userId: req.user._id, month, plannedVisits: plannedVisits || [], remarks: remarks || '' });
    await logActivity({ actor: req.user, action: 'mtp.create', entityType: 'MonthlyTourPlan', entityId: plan._id, message: `MTP created for ${month}` });
    return res.status(201).json({ success: true, message: 'MTP created', mtp: plan });
  }

  if (plannedVisits !== undefined) plan.plannedVisits = plannedVisits;
  if (remarks !== undefined) plan.remarks = remarks;
  // Editing after a rejection/withdrawal resets it to draft for a fresh cycle.
  plan.status = 'draft';
  plan.approverId = null;
  plan.decidedAt = null;
  plan.decisionNote = '';
  await plan.save();
  res.status(200).json({ success: true, message: 'MTP updated', mtp: plan });
});

/**
 * PATCH /api/mtp/:id/submit — submit for approval. `approverId` is always
 * computed server-side from the submitter's own reporting manager — the
 * mobile client cannot choose an approver (client decision: strict hierarchy).
 */
export const submitMtp = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid MTP id');
  const plan = await MonthlyTourPlan.findById(req.params.id);
  if (!plan) throw new ApiError(404, 'MTP not found');
  if (String(plan.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only submit your own MTP');
  if (!EDITABLE_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `MTP is already ${plan.status}`);
  }

  const submitter = await User.findById(req.user._id).select('employeeDetails.reportingManagerId');
  const approverId = submitter?.employeeDetails?.reportingManagerId;
  if (!approverId) throw new ApiError(400, 'You have no reporting manager assigned — cannot submit for approval');

  if (req.body.remarks !== undefined) plan.remarks = req.body.remarks;
  plan.status = 'pending';
  plan.approverId = approverId;
  plan.submittedAt = new Date();
  plan.decidedAt = null;
  plan.decisionNote = '';
  await plan.save();

  await logActivity({
    actor: req.user, action: 'mtp.submit', entityType: 'MonthlyTourPlan', entityId: plan._id,
    message: `MTP for ${plan.month} submitted for approval`
  });

  res.status(200).json({ success: true, message: 'MTP submitted for approval', mtp: plan });
});

/** PATCH /api/mtp/:id/withdraw — the BDM withdraws their own pending MTP. */
export const withdrawMtp = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid MTP id');
  const plan = await MonthlyTourPlan.findById(req.params.id);
  if (!plan) throw new ApiError(404, 'MTP not found');
  if (String(plan.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only withdraw your own MTP');
  if (plan.status !== 'pending') throw new ApiError(400, 'Only a pending MTP can be withdrawn');

  plan.status = 'withdrawn';
  await plan.save();
  await logActivity({ actor: req.user, action: 'mtp.withdraw', entityType: 'MonthlyTourPlan', entityId: plan._id, message: `MTP for ${plan.month} withdrawn` });
  res.status(200).json({ success: true, message: 'MTP withdrawn', mtp: plan });
});

/**
 * PATCH /api/mtp/:id/decision — approve/reject. Only the server-computed
 * `approverId` on this specific MTP (or admin/superadmin) may decide it —
 * never "any manager above," matching the strict-hierarchy decision.
 */
export const decideMtp = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid MTP id');
  const { status, note } = req.body;
  const plan = await MonthlyTourPlan.findById(req.params.id);
  if (!plan) throw new ApiError(404, 'MTP not found');
  if (plan.status !== 'pending') throw new ApiError(400, `MTP is already ${plan.status}`);

  const isDesignatedApprover = plan.approverId && String(plan.approverId) === String(req.user._id);
  if (!isDesignatedApprover && !hasCompanyWideFieldOpsAccess(req.user)) {
    throw new ApiError(403, 'Only the assigned approver may decide this MTP');
  }

  plan.status = status;
  plan.decidedAt = new Date();
  plan.decisionNote = note || '';
  await plan.save();

  await logActivity({
    actor: req.user, action: `mtp.${status}`, entityType: 'MonthlyTourPlan', entityId: plan._id,
    message: `MTP for ${plan.month} ${status}`
  });

  res.status(200).json({ success: true, message: `MTP ${status}`, mtp: plan });
});

/** GET /api/mtp/pending — the caller's own approval inbox (MTPs awaiting their decision). */
export const listPendingApprovals = asyncHandler(async (req, res) => {
  const filter = { status: 'pending' };
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    filter.approverId = req.user._id;
  }
  const plans = await MonthlyTourPlan.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ submittedAt: 1 });
  res.status(200).json({ success: true, data: plans });
});

/** GET /api/mtp/team — ASM+ read-only view of their reporting subtree's MTPs (any status). */
export const listTeamMtp = asyncHandler(async (req, res) => {
  const filter = {};
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  } else if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }
  if (req.query.month) filter.month = String(req.query.month);

  const plans = await MonthlyTourPlan.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ month: -1 })
    .limit(2000);
  res.status(200).json({ success: true, data: plans });
});
