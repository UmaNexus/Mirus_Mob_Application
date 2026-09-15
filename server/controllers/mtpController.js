import mongoose from 'mongoose';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import Doctor from '../models/Doctor.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';

const EDITABLE_STATUSES = ['draft', 'rejected', 'withdrawn'];
const VISIT_POPULATE = { path: 'plannedVisits.doctorId', select: 'name speciality area' };

/**
 * Validate a `plannedVisits` array before it is persisted. The mobile client
 * cannot be trusted to only ever send the submitter's own assigned doctors or
 * dates inside the target month — both are re-checked here against the
 * database on every write, never assumed from the request body.
 */
const assertPlannedVisitsValid = async (userId, month, plannedVisits) => {
  if (!plannedVisits || !plannedVisits.length) return;

  const doctorIds = [...new Set(plannedVisits.map((v) => String(v.doctorId)))];
  const owned = await Doctor.find({ _id: { $in: doctorIds }, assignedTo: userId }).select('_id');
  const ownedSet = new Set(owned.map((d) => String(d._id)));

  const seen = new Set();
  for (const visit of plannedVisits) {
    if (!visit.doctorId || !mongoose.isValidObjectId(visit.doctorId)) {
      throw new ApiError(400, 'Each planned visit needs a valid doctorId');
    }
    if (!ownedSet.has(String(visit.doctorId))) {
      throw new ApiError(403, 'You can only plan visits to doctors assigned to you');
    }
    if (!visit.date) throw new ApiError(400, 'Each planned visit needs a date');
    const visitMonth = new Date(visit.date).toISOString().slice(0, 7);
    if (visitMonth !== month) {
      throw new ApiError(400, `Planned visit date must fall within ${month}`);
    }
    const key = `${visit.doctorId}_${new Date(visit.date).toISOString().slice(0, 10)}`;
    if (seen.has(key)) throw new ApiError(400, 'Duplicate planned visit: same doctor and date appear twice');
    seen.add(key);
  }
};

/**
 * GET /api/mtp?month=YYYY-MM — the caller's own tour plan(s). Own records
 * only (ownership). A BDM may have several independent tour submissions
 * within the same month, so this always returns every matching plan, not
 * just one — the mobile "month view" renders each as its own tour card.
 */
export const listMyMtp = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.month) filter.month = String(req.query.month);
  const plans = await MonthlyTourPlan.find(filter).sort({ createdAt: -1 }).populate(VISIT_POPULATE);
  res.status(200).json({ success: true, data: plans });
});

/**
 * POST /api/mtp — start a brand-new tour submission ("+ Create New Tour").
 * Always creates a new document; a BDM may have any number of these within
 * the same month (draft, pending, approved, rejected, or withdrawn ones all
 * coexist independently — creating a new tour never touches an existing
 * one). To keep editing an existing draft/rejected/withdrawn tour, use
 * PATCH /api/mtp/:id instead.
 */
export const createMtp = asyncHandler(async (req, res) => {
  const { month, plannedVisits, remarks } = req.body;
  if (plannedVisits !== undefined) await assertPlannedVisitsValid(req.user._id, month, plannedVisits);

  const plan = await MonthlyTourPlan.create({ userId: req.user._id, month, plannedVisits: plannedVisits || [], remarks: remarks || '' });
  await plan.populate(VISIT_POPULATE);
  await logActivity({ actor: req.user, action: 'mtp.create', entityType: 'MonthlyTourPlan', entityId: plan._id, message: `Tour plan created for ${month}` });
  res.status(201).json({ success: true, message: 'Tour plan created', mtp: plan });
});

/**
 * PATCH /api/mtp/:id — edit one specific tour submission the caller owns.
 * Editable only while draft/rejected/withdrawn — a pending/approved tour
 * must be withdrawn (or decided) before it can be changed again. `month` is
 * fixed by the record and cannot be changed here (create a new tour for a
 * different month instead).
 */
export const updateMtp = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid MTP id');
  const plan = await MonthlyTourPlan.findById(req.params.id);
  if (!plan) throw new ApiError(404, 'Tour plan not found');
  if (String(plan.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only edit your own tour plan');
  if (!EDITABLE_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `This tour plan is ${plan.status} and cannot be edited directly — withdraw it first`);
  }

  const { plannedVisits, remarks } = req.body;
  if (plannedVisits !== undefined) await assertPlannedVisitsValid(req.user._id, plan.month, plannedVisits);

  if (plannedVisits !== undefined) plan.plannedVisits = plannedVisits;
  if (remarks !== undefined) plan.remarks = remarks;
  // Editing after a rejection/withdrawal resets it to draft for a fresh cycle.
  plan.status = 'draft';
  plan.approverId = null;
  plan.decidedAt = null;
  plan.decisionNote = '';
  await plan.save();
  await plan.populate(VISIT_POPULATE);
  res.status(200).json({ success: true, message: 'Tour plan updated', mtp: plan });
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
  await plan.populate(VISIT_POPULATE);

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
  await plan.populate(VISIT_POPULATE);
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
  await plan.populate(VISIT_POPULATE);

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
    .populate(VISIT_POPULATE)
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
    .populate(VISIT_POPULATE)
    .sort({ month: -1 })
    .limit(2000);
  res.status(200).json({ success: true, data: plans });
});
