import mongoose from 'mongoose';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import Doctor from '../models/Doctor.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds, buildReportingChainAbove, canAccessFieldOpsUser } from '../middleware/fieldForceAuth.js';
import { buildApprovalInfo } from '../utils/approvalInfo.js';
import { dispatchNotification } from '../services/notificationService.js';

const EDITABLE_STATUSES = ['draft', 'rejected', 'withdrawn'];
const APPROVER_SELECT = 'personalDetails.firstName personalDetails.lastName role employeeDetails.fieldForce employeeDetails.employeeId';
const POPULATE = [
  { path: 'plannedVisits.doctorId', select: 'name speciality area' },
  { path: 'approverId', select: APPROVER_SELECT }
];

// Eligible approver tiers, per the fixed hierarchy (never RBM/ZBM). Admin/
// superadmin qualify separately via their existing company-wide access.
const APPROVER_TIERS = ['ASM', 'RSM', 'ZSM', 'NSM'];

/**
 * The caller's own real eligible approvers:
 *  - every ASM+ tier manager in their own reporting chain
 *    (`buildReportingChainAbove` — a straight walk up `reportingManagerId`,
 *    so it can never include a peer/unrelated user or cross-tenant record), and
 *  - every admin/superadmin in the same tenant — company-wide access holders
 *    are eligible regardless of the literal reporting chain, mirroring the
 *    exact same bypass `decideMtp` already grants them (an admin isn't
 *    necessarily anyone's line manager in `reportingManagerId`, but already
 *    has blanket authority to decide any pending MTP).
 *
 * This is the single source of truth for both the "Select Approver" list
 * and the server-side check on submit — the client can never expand it by
 * sending an arbitrary id.
 */
const resolveEligibleApprovers = async (userId) => {
  const chainIds = [...(await buildReportingChainAbove(userId))];
  const [chainUsers, admins] = await Promise.all([
    chainIds.length ? User.find({ _id: { $in: chainIds } }).select(APPROVER_SELECT) : [],
    User.find({ role: { $in: ['admin', 'superadmin'] } }).select(APPROVER_SELECT)
  ]);
  const tieredApprovers = chainUsers.filter((u) => APPROVER_TIERS.includes(u.employeeDetails?.fieldForce?.tier));
  return [...tieredApprovers, ...admins];
};

/**
 * Validate a `plannedVisits` array before it is persisted. Each entry is a
 * date + Area/Location (never a doctor — see the model doc). The mobile
 * client cannot be trusted to only ever send an area the submitter is
 * actually authorized to plan, or dates inside the target month, or a
 * date-range that doesn't collide with another one already in this same
 * plan — all three are re-checked here against the database on every write.
 *
 * "Authorized area" reuses the existing Doctor.area / assignment data (the
 * BDM's own assigned doctors' areas) rather than a separate Area model, per
 * the existing territory convention — there is no dedicated Area collection
 * to check against.
 */
const assertPlannedVisitsValid = async (userId, month, plannedVisits) => {
  if (!plannedVisits || !plannedVisits.length) return;

  const authorizedAreas = new Set((await Doctor.distinct('area', { assignedTo: userId })).filter(Boolean));

  const seenDates = new Set();
  for (const visit of plannedVisits) {
    if (!visit.area) throw new ApiError(400, 'Each planned visit needs an area');
    if (!authorizedAreas.has(visit.area)) {
      throw new ApiError(403, `You are not authorized to plan the area "${visit.area}"`);
    }
    if (!visit.date) throw new ApiError(400, 'Each planned visit needs a date');
    const visitMonth = new Date(visit.date).toISOString().slice(0, 7);
    if (visitMonth !== month) {
      throw new ApiError(400, `Planned visit date must fall within ${month}`);
    }
    // Flattened date ranges naturally expose an overlap as the same date
    // appearing twice — regardless of area, one date can only ever belong
    // to one range in a single tour plan.
    const dateKey = new Date(visit.date).toISOString().slice(0, 10);
    if (seenDates.has(dateKey)) {
      throw new ApiError(400, `${dateKey} is already assigned to another date range in this tour plan — date ranges cannot overlap`);
    }
    seenDates.add(dateKey);
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
  const plans = await MonthlyTourPlan.find(filter).sort({ createdAt: -1 }).populate(POPULATE);
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
  await plan.populate(POPULATE);
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
  await plan.populate(POPULATE);
  res.status(200).json({ success: true, message: 'Tour plan updated', mtp: plan });
});

/**
 * GET /api/mtp/approvers — the caller's own eligible approvers, for the
 * "Select Approver" picker. See `resolveEligibleApprovers` — a real,
 * server-computed subset of the caller's own reporting chain; the client
 * only ever gets to choose among what this endpoint actually returns, and
 * `submitMtp` independently re-derives the same set rather than trusting
 * whatever the client remembered from this call.
 */
export const listEligibleApprovers = asyncHandler(async (req, res) => {
  const approvers = await resolveEligibleApprovers(req.user._id);
  res.status(200).json({ success: true, data: approvers });
});

/**
 * PATCH /api/mtp/:id/submit — submit for approval to an explicitly BDM-
 * selected approver. The client sends `approverId`, but it is never trusted
 * blindly: it must be one of `resolveEligibleApprovers(req.user._id)` — a
 * real manager in the caller's own reporting chain, ASM+ tier or
 * company-wide access — or the submission is rejected. There is no
 * fallback to "the immediate reporting manager"; an approver must always be
 * explicitly chosen.
 */
export const submitMtp = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid MTP id');
  const plan = await MonthlyTourPlan.findById(req.params.id);
  if (!plan) throw new ApiError(404, 'MTP not found');
  if (String(plan.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only submit your own MTP');
  if (!EDITABLE_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `MTP is already ${plan.status}`);
  }

  const { approverId } = req.body;
  if (!approverId || !mongoose.isValidObjectId(approverId)) {
    throw new ApiError(400, 'Please select an approver before submitting the MTP');
  }
  const eligible = await resolveEligibleApprovers(req.user._id);
  const chosen = eligible.find((u) => String(u._id) === String(approverId));
  if (!chosen) {
    throw new ApiError(403, 'The selected approver is not eligible to approve your MTP');
  }

  if (req.body.remarks !== undefined) plan.remarks = req.body.remarks;
  plan.status = 'pending';
  plan.approverId = chosen._id;
  plan.submittedAt = new Date();
  plan.decidedAt = null;
  plan.decisionNote = '';
  await plan.save();
  await plan.populate(POPULATE);

  await logActivity({
    actor: req.user, action: 'mtp.submit', entityType: 'MonthlyTourPlan', entityId: plan._id,
    message: `MTP for ${plan.month} submitted for approval`
  });

  const employeeName = [req.user?.personalDetails?.firstName, req.user?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
  const visitsCount = (plan.plannedVisits || []).length;
  if (chosen?._id) {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [chosen._id],
      senderId: req.user._id,
      module: 'mtp',
      eventId: 'MTP_SUBMITTED',
      title: `MTP Submitted: ${plan.month}`,
      body: `${employeeName} submitted Monthly Tour Plan for ${plan.month} (${visitsCount} visits planned)`,
      priority: 'high',
      deepLink: `mirus://manager/approvals/mtp/${plan._id}`,
      entityType: 'MonthlyTourPlan',
      entityId: plan._id,
      data: { screen: 'MtpReviewScreen', planId: plan._id, bdmName: employeeName, month: plan.month }
    }).catch(() => {});
  }

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
  await plan.populate(POPULATE);
  await logActivity({ actor: req.user, action: 'mtp.withdraw', entityType: 'MonthlyTourPlan', entityId: plan._id, message: `MTP for ${plan.month} withdrawn` });

  const employeeName = [req.user?.personalDetails?.firstName, req.user?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
  if (plan.approverId) {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [plan.approverId],
      senderId: req.user._id,
      module: 'mtp',
      eventId: 'MTP_WITHDRAWN',
      title: 'MTP Withdrawn by Submitter',
      body: `${employeeName} withdrew their Tour Plan submission for ${plan.month}`,
      priority: 'medium',
      deepLink: 'mirus://manager/approvals?tab=mtp',
      entityType: 'MonthlyTourPlan',
      entityId: plan._id,
      data: { screen: 'ApprovalsScreen', tab: 'mtp', planId: plan._id }
    }).catch(() => {});
  }

  res.status(200).json({ success: true, message: 'MTP withdrawn', mtp: plan });
});

/**
 * PATCH /api/mtp/:id/decision — approve/reject. Either the designated
 * approver stamped on this MTP or any manager above the claimant in the
 * reporting chain (or admin/superadmin) may decide it.
 */
export const decideMtp = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid MTP id');
  const { status, note } = req.body;
  const plan = await MonthlyTourPlan.findById(req.params.id);
  if (!plan) throw new ApiError(404, 'MTP not found');
  if (plan.status !== 'pending') throw new ApiError(400, `MTP is already ${plan.status}`);

  const isDesignatedApprover = plan.approverId && String(plan.approverId) === String(req.user._id);
  let isSeniorToApprover = false;
  if (plan.approverId) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    isSeniorToApprover = subtree.has(String(plan.approverId));
  } else {
    isSeniorToApprover = await canAccessFieldOpsUser(req.user, plan.userId);
  }
  if (!isDesignatedApprover && !isSeniorToApprover && !hasCompanyWideFieldOpsAccess(req.user)) {
    throw new ApiError(403, 'Only the assigned approver or authorized manager may decide this MTP');
  }

  plan.status = status;
  plan.approverId = req.user._id;
  plan.decidedAt = new Date();
  plan.decisionNote = note || '';
  await plan.save();
  await plan.populate(POPULATE);

  await logActivity({
    actor: req.user, action: `mtp.${status}`, entityType: 'MonthlyTourPlan', entityId: plan._id,
    message: `MTP for ${plan.month} ${status}`
  });

  const managerName = [req.user?.personalDetails?.firstName, req.user?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Manager';
  if (status === 'approved') {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [plan.userId],
      senderId: req.user._id,
      module: 'mtp',
      eventId: 'MTP_APPROVED',
      title: `Tour Plan Approved: ${plan.month}`,
      body: `Your Tour Plan for ${plan.month} has been approved by ${managerName}.${note ? ` Note: "${note}"` : ''}`,
      priority: 'high',
      deepLink: `mirus://bdm/mtp/${plan._id}`,
      entityType: 'MonthlyTourPlan',
      entityId: plan._id,
      data: { screen: 'TourDetailScreen', planId: plan._id, month: plan.month }
    }).catch(() => {});
  } else {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [plan.userId],
      senderId: req.user._id,
      module: 'mtp',
      eventId: 'MTP_REJECTED',
      title: 'Tour Plan Needs Revision',
      body: `Your Tour Plan for ${plan.month} was rejected by ${managerName}.${note ? ` Reason: "${note}"` : ''}`,
      priority: 'high',
      deepLink: `mirus://bdm/mtp/${plan._id}`,
      entityType: 'MonthlyTourPlan',
      entityId: plan._id,
      data: { screen: 'TourDetailScreen', planId: plan._id, month: plan.month, reason: note }
    }).catch(() => {});
  }

  res.status(200).json({ success: true, message: `MTP ${status}`, mtp: plan });
});

/** GET /api/mtp/pending — MTPs awaiting the caller's decision (approverId=self, or assigned to subordinate manager, or unassigned in reporting subtree). */
export const listPendingApprovals = asyncHandler(async (req, res) => {
  const filter = { status: 'pending' };
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.$or = [
      { approverId: req.user._id },
      { approverId: { $in: [...subtree] } },
      { approverId: null, userId: { $in: [...subtree] } }
    ];
  }
  const plans = await MonthlyTourPlan.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .populate(POPULATE)
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
    .populate(POPULATE)
    .sort({ month: -1 })
    .limit(2000);

  // `approval` — read-only, additive summary of the ALREADY-STORED decision
  // (see buildApprovalInfo doc comment). Additive only: `approverId` itself
  // is still returned as before, so existing callers (e.g. TeamMtpScreen)
  // are unaffected.
  const data = plans.map((plan) => ({ ...plan.toObject(), approval: buildApprovalInfo(plan) }));
  res.status(200).json({ success: true, data });
});
