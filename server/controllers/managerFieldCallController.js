import mongoose from 'mongoose';
import ManagerFieldCall from '../models/ManagerFieldCall.js';
import Doctor from '../models/Doctor.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';

/** POST /api/manager-field-calls — a manager (ASM+) logs their own field visit. */
export const createManagerFieldCall = asyncHandler(async (req, res) => {
  const {
    visitType, reason, area, doctorId, contactName, speciality,
    productsDetailed, samplesGiven, feedback, loggedAt
  } = req.body;

  if (doctorId) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) throw new ApiError(404, 'Doctor not found');
    // A manager may reference any doctor within their own visibility scope:
    // unassigned, or assigned to someone in their reporting subtree.
    if (!hasCompanyWideFieldOpsAccess(req.user) && doctor.assignedTo) {
      const subtree = await buildReportingSubtreeIds(req.user._id);
      if (!subtree.has(String(doctor.assignedTo))) {
        throw new ApiError(403, 'This doctor is outside your reporting scope');
      }
    }
  }

  const tier = req.user.employeeDetails?.fieldForce?.tier;
  if (!tier && !hasCompanyWideFieldOpsAccess(req.user)) {
    throw new ApiError(403, 'A field-force tier is required to log a manager field call');
  }

  const call = await ManagerFieldCall.create({
    userId: req.user._id,
    tier: tier || 'NSM', // admin/superadmin without a tier of their own are recorded at the top tier for reporting purposes
    area, visitType, reason, doctorId: doctorId || null, contactName, speciality,
    productsDetailed, samplesGiven, feedback,
    loggedAt: loggedAt ? new Date(loggedAt) : new Date()
  });

  await logActivity({
    actor: req.user, action: 'managerFieldCall.create', entityType: 'ManagerFieldCall', entityId: call._id,
    message: `Manager field call logged (${reason})`
  });

  res.status(201).json({ success: true, message: 'Field call logged', call });
});

/** GET /api/manager-field-calls — the caller's own logged field calls. */
export const listMyManagerFieldCalls = asyncHandler(async (req, res) => {
  const calls = await ManagerFieldCall.find({ userId: req.user._id })
    .populate('doctorId', 'name speciality')
    .sort({ loggedAt: -1 });
  res.status(200).json({ success: true, data: calls });
});

/**
 * GET /api/manager-field-calls/team — visible to the logging manager's own
 * reporting manager and Admin (per the mobile demo's stated visibility rule),
 * implemented as the same reporting-subtree scope used by every other domain.
 */
export const listTeamManagerFieldCalls = asyncHandler(async (req, res) => {
  const filter = {};
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  } else if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }

  const calls = await ManagerFieldCall.find(filter)
    .populate('doctorId', 'name speciality')
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ loggedAt: -1 })
    .limit(2000);
  res.status(200).json({ success: true, data: calls });
});
