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

/** POST /api/dcr — a BDM logs an individual, joint, or missed call. */
export const createDcr = asyncHandler(async (req, res) => {
  const { type, doctorId, accompaniedBy, productsDetailed, samplesGiven, feedback, visitTime } = req.body;

  // Ownership: a BDM may only log calls for doctors assigned to them. A single
  // query collapses "doctor doesn't exist", "belongs to another tenant", and
  // "assigned to someone else" into one generic 404 (no cross-tenant/ownership
  // enumeration), consistent with how the rest of the app handles this.
  const doctor = await Doctor.findOne({ _id: doctorId, assignedTo: req.user._id });
  if (!doctor) throw new ApiError(404, 'Doctor not found or not assigned to you');

  if (type === 'joint') {
    const chainAbove = await buildReportingChainAbove(req.user._id);
    if (!chainAbove.has(String(accompaniedBy))) {
      throw new ApiError(403, 'accompaniedBy must be a manager in your own reporting chain');
    }
  }

  const date = req.body.date ? new Date(req.body.date) : new Date();
  const dcr = await DailyCallReport.create({
    userId: req.user._id,
    date,
    dateKey: dateKeyOf(date),
    type,
    doctorId,
    accompaniedBy: type === 'joint' ? accompaniedBy : null,
    productsDetailed,
    samplesGiven,
    feedback,
    visitTime: visitTime ? new Date(visitTime) : new Date()
  });

  await logActivity({
    actor: req.user, action: `dcr.${type}`, entityType: 'DailyCallReport', entityId: dcr._id,
    message: `${type === 'missed' ? 'Missed visit logged' : `Logged a ${type} call`} for "${doctor.name}"`
  });

  res.status(201).json({ success: true, message: 'Call logged', dcr });
});

/** GET /api/dcr — a BDM's own calls (own record only, ownership per the 6-point check). */
export const listMyDcr = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.date) filter.dateKey = String(req.query.date);
  if (req.query.type) filter.type = req.query.type;

  const dcrs = await DailyCallReport.find(filter).populate('doctorId', 'name speciality').sort({ visitTime: -1 });
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
    .populate('doctorId', 'name speciality')
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ visitTime: -1 })
    .limit(2000);
  res.status(200).json({ success: true, data: dcrs });
});

/** PATCH /api/dcr/submit-day — mark the caller's own un-submitted entries for a day as submitted. */
export const submitDay = asyncHandler(async (req, res) => {
  const dateKey = dateKeyOf(req.body.date);
  const result = await DailyCallReport.updateMany(
    { userId: req.user._id, dateKey, submittedAt: null },
    { $set: { submittedAt: new Date() } }
  );
  res.status(200).json({ success: true, message: 'DCR submitted', modifiedCount: result.modifiedCount });
});
