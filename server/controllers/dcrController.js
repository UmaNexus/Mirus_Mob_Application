import mongoose from 'mongoose';
import DailyCallReport from '../models/DailyCallReport.js';
import Doctor from '../models/Doctor.js';
import User from '../models/User.js';
import { dispatchNotification } from '../services/notificationService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import {
  hasCompanyWideFieldOpsAccess,
  buildReportingSubtreeIds,
  isEligibleJointCallParticipant
} from '../middleware/fieldForceAuth.js';

const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10);
const DOCTOR_SELECT = 'name speciality area';
// A double-tap or a network retry re-posting the exact same call within this
// window returns the row already created instead of creating a second one —
// long enough to absorb an accidental repeat, short enough to never block a
// genuine second visit to the same doctor later the same day.
const DUPLICATE_WINDOW_MS = 5000;

const DOCTOR_TYPES = new Set(['individual', 'joint']);
// Meeting is deliberately NOT a DCR category — it is an internal activity
// tracked only via Today's Work Type, never a doctor call (see
// workTypeController.js). Camp remains a legitimate DCR activity type.
const ACTIVITY_TYPES = new Set(['camp']);

/**
 * POST /api/dcr — a BDM logs one activity for the day (individual call,
 * joint call, camp, or a directly-logged missed visit). This row simply
 * joins the caller's existing Daily DCR for this date (every row sharing
 * companyId+userId+dateKey) — there is no day-level document to create or
 * duplicate, and no check on whether the day was already submitted: a BDM
 * may always log a legitimate new activity for today, even after
 * submitting. Doing so is what makes that day's report need resubmission
 * (see the module doc on DailyCallReport for why that is derived, not
 * stored).
 *
 * An individual/joint/camp entry is born `status: 'pending'` — this is the
 * same endpoint Today's Work Type's "Confirm & Log Call" uses, so a quick
 * work-type entry and a DCR-list entry are never two different records for
 * one activity, and every category is completed/marked missed the same
 * consistent way from the DCR detail screen. Only a directly-logged
 * `missed` call has nothing left to complete, so it alone is born
 * `status: 'missed'`.
 */
export const createDcr = asyncHandler(async (req, res) => {
  const { type, doctorId, accompaniedBy, activityName, venue, productsDetailed, samplesGiven, feedback, visitTime } = req.body;
  const date = req.body.date ? new Date(req.body.date) : new Date();
  const dateKey = dateKeyOf(date);

  let doctor = null;
  if (DOCTOR_TYPES.has(type)) {
    // Ownership: a BDM may only log calls for doctors assigned to them. A single
    // query collapses "doctor doesn't exist", "belongs to another tenant", and
    // "assigned to someone else" into one generic 404 (no cross-tenant/ownership
    // enumeration), consistent with how the rest of the app handles this.
    doctor = await Doctor.findOne({ _id: doctorId, assignedTo: req.user._id });
    if (!doctor) throw new ApiError(404, 'Doctor not found or not assigned to you');

    if (type === 'joint') {
      const eligible = await isEligibleJointCallParticipant(req.user._id, accompaniedBy);
      if (!eligible) {
        throw new ApiError(403, 'accompaniedBy must be an eligible manager above you or a BDM on your own team');
      }
    }
  }

  const duplicateFilter = DOCTOR_TYPES.has(type)
    ? { userId: req.user._id, doctorId, type, dateKey }
    : { userId: req.user._id, type, dateKey, activityName };
  const duplicate = await DailyCallReport.findOne({
    ...duplicateFilter,
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) }
  }).populate('doctorId', DOCTOR_SELECT);
  if (duplicate) {
    return res.status(201).json({ success: true, message: 'Activity logged', dcr: duplicate });
  }

  const dcr = await DailyCallReport.create({
    userId: req.user._id,
    date,
    dateKey,
    type,
    status: type === 'missed' ? 'missed' : 'pending',
    doctorId: DOCTOR_TYPES.has(type) ? doctorId : null,
    accompaniedBy: type === 'joint' ? accompaniedBy : null,
    activityName: ACTIVITY_TYPES.has(type) ? activityName : '',
    venue: ACTIVITY_TYPES.has(type) ? (venue || '') : '',
    productsDetailed,
    samplesGiven,
    feedback,
    visitTime: visitTime ? new Date(visitTime) : new Date()
  });
  await dcr.populate('doctorId', DOCTOR_SELECT);

  await logActivity({
    actor: req.user, action: `dcr.${type}`, entityType: 'DailyCallReport', entityId: dcr._id,
    message: doctor ? `${type === 'missed' ? 'Missed visit logged' : `Logged a ${type} call`} for "${doctor.name}"` : `Logged a ${type} activity${activityName ? `: "${activityName}"` : ''}`
  });

  if (type === 'joint' && accompaniedBy) {
    const employeeName = [req.user?.personalDetails?.firstName, req.user?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
    const docName = doctor?.name ? `Dr. ${doctor.name}` : 'Doctor';
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [accompaniedBy],
      senderId: req.user._id,
      module: 'dcr',
      eventId: 'DCR_JOINT_CALL_NOTIFICATION',
      title: 'Joint Call Logged With You',
      body: `${employeeName} tagged you in a joint call with ${docName}${doctor?.area ? ` in ${doctor.area}` : ''}`,
      priority: 'medium',
      deepLink: 'mirus://bdm/dcr',
      entityType: 'DailyCallReport',
      entityId: dcr._id,
      data: { screen: 'DcrReviewDetailScreen', reportId: dcr._id, dateKey }
    }).catch(() => {});
  }

  res.status(201).json({ success: true, message: 'Activity logged', dcr });
});

/**
 * PATCH /api/dcr/:id — complete (or edit) the caller's own DCR: samples,
 * product detail, feedback, start/end time, and the pending →
 * completed/missed status transition. `doctorId`/`type` are fixed at
 * creation and never editable here (the doctor and call category shown are
 * always read-only in the mobile detail screen). Locked once the day has
 * been submitted.
 *
 * `startTime`/`endTime` replace the single `visitTime` for manual entry —
 * both are optional (never required for a missed call, and not required at
 * all otherwise) but when both end up set, `endTime` must be strictly after
 * `startTime`. Whenever `startTime` changes, the legacy `visitTime` field is
 * mirrored to it so old records (which only ever had `visitTime`) and new
 * records both sort/display consistently everywhere else in the app.
 */
export const updateDcr = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid DCR id');
  const dcr = await DailyCallReport.findById(req.params.id);
  if (!dcr) throw new ApiError(404, 'DCR not found');
  if (String(dcr.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only edit your own DCR');
  if (dcr.submittedAt) throw new ApiError(400, 'This day\'s DCR has already been submitted and cannot be edited');

  const { productsDetailed, samplesGiven, feedback, activityName, venue, visitTime, startTime, endTime, status } = req.body;
  if (productsDetailed !== undefined) dcr.productsDetailed = productsDetailed;
  if (samplesGiven !== undefined) dcr.samplesGiven = samplesGiven;
  if (feedback !== undefined) dcr.feedback = feedback;
  if (activityName !== undefined) dcr.activityName = activityName;
  if (venue !== undefined) dcr.venue = venue;
  if (visitTime !== undefined) dcr.visitTime = new Date(visitTime);
  if (startTime !== undefined) {
    dcr.startTime = startTime ? new Date(startTime) : null;
    if (dcr.startTime) dcr.visitTime = dcr.startTime;
  }
  if (endTime !== undefined) dcr.endTime = endTime ? new Date(endTime) : null;
  if (status !== undefined) dcr.status = status;

  if (dcr.startTime && dcr.endTime && dcr.endTime <= dcr.startTime) {
    throw new ApiError(400, 'endTime must be after startTime');
  }

  await dcr.save();
  await dcr.populate('doctorId', DOCTOR_SELECT);

  await logActivity({
    actor: req.user, action: 'dcr.update', entityType: 'DailyCallReport', entityId: dcr._id,
    message: `DCR updated${status ? ` — status: ${status}` : ''}`
  });

  res.status(200).json({ success: true, message: 'DCR updated', dcr });
});

/**
 * GET /api/dcr — a BDM's own calls (own record only, ownership per the
 * 6-point check). `type` and `status` are independent filter dimensions — a
 * caller may pass either, both, or neither; the DCR screen itself always
 * fetches unfiltered and filters client-side so summary counts and
 * submission are never affected by the currently displayed filter.
 */
export const listMyDcr = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };

  if (req.query.date) filter.dateKey = String(req.query.date);
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;

  console.log('DCR FILTER:', filter);
  console.log('REQUEST DATE:', req.query.date);
  console.log('USER ID:', req.user._id);

  const dcrs = await DailyCallReport.find(filter)
    .populate('doctorId', DOCTOR_SELECT)
    .sort({ visitTime: -1 });

  console.log('TODAY DCR COUNT:', dcrs.length);
  console.log('TODAY DCRs:', dcrs);

  res.status(200).json({
    success: true,
    data: dcrs
  });
});

const todayKey = () => dateKeyOf(new Date());

/**
 * GET /api/dcr/team — ASM+ read-only view of their reporting subtree's calls
 * (organizational scope), or company-wide for admin/superadmin. Powers both
 * the Manager DCR Review list and detail screens off a single call: rows
 * already carry everything a detail view needs (doctor, area, type,
 * products, samples, feedback, start/end time, status, submittedAt), so the
 * client groups these same rows by BDM+dateKey for the list summary instead
 * of a second endpoint duplicating that logic.
 *
 * `period` (today|week|month, default 'today') filters by dateKey range —
 * the same today/week/month convention as getTeamAttendance. An explicit
 * `date` query param (exact dateKey match) takes precedence over `period`,
 * preserving the endpoint's original single-day lookup for existing callers.
 */
export const listTeamDcr = asyncHandler(async (req, res) => {
  const filter = {};
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  } else if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }

  if (req.query.date) {
    filter.dateKey = String(req.query.date);
  } else {
    const period = ['today', 'week', 'month'].includes(req.query.period) ? req.query.period : 'today';
    const today = todayKey();
    let startKey = today;
    if (period === 'week') {
      const now = new Date();
      const diffToMonday = (now.getUTCDay() + 6) % 7;
      startKey = dateKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday)));
    } else if (period === 'month') {
      startKey = `${today.slice(0, 7)}-01`;
    }
    filter.dateKey = { $gte: startKey, $lte: today };
  }
  if (req.query.type) filter.type = req.query.type;

  const dcrs = await DailyCallReport.find(filter)
    .populate('doctorId', DOCTOR_SELECT)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce employeeDetails.employeeId')
    .sort({ dateKey: -1, visitTime: -1 })
    .limit(2000);
  res.status(200).json({ success: true, data: dcrs });
});

/**
 * PATCH /api/dcr/mark-remaining-missed — bulk-transition the caller's own
 * still-`pending` calls for a day to `status: 'missed'`. Offered at
 * end-of-day alongside Submit DCR so a BDM never has to tap through each
 * leftover pending call individually — mirrors submitDay's own
 * updateMany-by-dateKey shape.
 */
export const markRemainingMissed = asyncHandler(async (req, res) => {
  const dateKey = dateKeyOf(req.body.date);
  const result = await DailyCallReport.updateMany(
    { userId: req.user._id, dateKey, status: 'pending' },
    { $set: { status: 'missed' } }
  );
  res.status(200).json({ success: true, message: 'Remaining calls marked missed', modifiedCount: result.modifiedCount });
});

/**
 * PATCH /api/dcr/submit-day — mark the caller's own un-submitted entries for
 * a day as submitted, sending them to the reporting manager. Refuses while
 * any call for that day is still `pending` — the BDM must complete it or use
 * mark-remaining-missed first; submission never silently completes or
 * discards a pending call.
 */
export const submitDay = asyncHandler(async (req, res) => {
  const dateKey = dateKeyOf(req.body.date);

  const pendingCount = await DailyCallReport.countDocuments({ userId: req.user._id, dateKey, status: 'pending' });
  if (pendingCount > 0) {
    throw new ApiError(400, `You have ${pendingCount} pending call${pendingCount === 1 ? '' : 's'}. Complete them or mark them as missed before submitting today's DCR.`, { pendingCount });
  }

  const result = await DailyCallReport.updateMany(
    { userId: req.user._id, dateKey, submittedAt: null },
    { $set: { submittedAt: new Date() } }
  );

  const submitter = await User.findById(req.user._id).select('personalDetails employeeDetails.reportingManagerId');
  const managerId = submitter?.employeeDetails?.reportingManagerId;
  const employeeName = [submitter?.personalDetails?.firstName, submitter?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
  const totalCalls = await DailyCallReport.countDocuments({ userId: req.user._id, dateKey });

  if (managerId) {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [managerId],
      senderId: req.user._id,
      module: 'dcr',
      eventId: 'DCR_SUBMITTED',
      title: `DCR Submitted: ${employeeName}`,
      body: `${employeeName} submitted Daily Call Report for ${dateKey} (${totalCalls} calls completed)`,
      priority: 'medium',
      deepLink: `mirus://manager/dcr-review/${req.user._id}/${dateKey}`,
      entityType: 'DailyCallReport',
      entityId: null,
      data: { screen: 'DcrReviewDetailScreen', userId: req.user._id, dateKey, totalCalls }
    }).catch(() => {});
  }

  res.status(200).json({ success: true, message: 'DCR submitted', modifiedCount: result.modifiedCount });
});
