import mongoose from 'mongoose';
import DailyCallReport from '../models/DailyCallReport.js';
import Doctor from '../models/Doctor.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import {
  hasCompanyWideFieldOpsAccess,
  buildReportingSubtreeIds,
  buildReportingChainAbove
} from '../middleware/fieldForceAuth.js';

const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10);
const DOCTOR_SELECT = 'name speciality area';
// A double-tap or a network retry re-posting the exact same call within this
// window returns the row already created instead of creating a second one —
// long enough to absorb an accidental repeat, short enough to never block a
// genuine second visit to the same doctor later the same day.
const DUPLICATE_WINDOW_MS = 5000;

const DOCTOR_TYPES = new Set(['individual', 'joint']);
const ACTIVITY_TYPES = new Set(['camp', 'meeting']);

/**
 * POST /api/dcr — a BDM logs one activity for the day (individual call,
 * joint call, camp, meeting, or a directly-logged missed visit). This row
 * simply joins the caller's existing Daily DCR for this date (every row
 * sharing companyId+userId+dateKey) — there is no day-level document to
 * create or duplicate, and no check on whether the day was already
 * submitted: a BDM may always log a legitimate new activity for today, even
 * after submitting. Doing so is what makes that day's report need
 * resubmission (see the module doc on DailyCallReport for why that is
 * derived, not stored).
 *
 * An individual/joint/camp/meeting entry is born `status: 'pending'` — this
 * is the same endpoint Today's Work Type's "Confirm & Log Call" uses, so a
 * quick work-type entry and a DCR-list entry are never two different
 * records for one activity, and every category is completed/marked missed
 * the same consistent way from the DCR detail screen. Only a directly-logged
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
      const chainAbove = await buildReportingChainAbove(req.user._id);
      if (!chainAbove.has(String(accompaniedBy))) {
        throw new ApiError(403, 'accompaniedBy must be a manager in your own reporting chain');
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

  res.status(201).json({ success: true, message: 'Activity logged', dcr });
});

/**
 * PATCH /api/dcr/:id — complete (or edit) the caller's own DCR: samples,
 * product detail, feedback, visit time, and the pending → completed/missed
 * status transition. `doctorId`/`type` are fixed at creation and never
 * editable here (the doctor and call category shown are always read-only in
 * the mobile detail screen). Locked once the day has been submitted.
 */
export const updateDcr = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid DCR id');
  const dcr = await DailyCallReport.findById(req.params.id);
  if (!dcr) throw new ApiError(404, 'DCR not found');
  if (String(dcr.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only edit your own DCR');
  if (dcr.submittedAt) throw new ApiError(400, 'This day\'s DCR has already been submitted and cannot be edited');

  const { productsDetailed, samplesGiven, feedback, activityName, venue, visitTime, status } = req.body;
  if (productsDetailed !== undefined) dcr.productsDetailed = productsDetailed;
  if (samplesGiven !== undefined) dcr.samplesGiven = samplesGiven;
  if (feedback !== undefined) dcr.feedback = feedback;
  if (activityName !== undefined) dcr.activityName = activityName;
  if (venue !== undefined) dcr.venue = venue;
  if (visitTime !== undefined) dcr.visitTime = new Date(visitTime);
  if (status !== undefined) dcr.status = status;

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

  const dcrs = await DailyCallReport.find(filter).populate('doctorId', DOCTOR_SELECT).sort({ visitTime: -1 });
  res.status(200).json({ success: true, data: dcrs });
});

/**
 * GET /api/dcr/team — ASM+ read-only view of their reporting subtree's calls
 * (organizational scope), or company-wide for admin/superadmin.
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
  if (req.query.date) filter.dateKey = String(req.query.date);
  if (req.query.type) filter.type = req.query.type;

  const dcrs = await DailyCallReport.find(filter)
    .populate('doctorId', DOCTOR_SELECT)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ visitTime: -1 })
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
  res.status(200).json({ success: true, message: 'DCR submitted', modifiedCount: result.modifiedCount });
});
