import WorkType from '../models/WorkType.js';
import LeaveRequest from '../models/LeaveRequest.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import {
  hasCompanyWideFieldOpsAccess,
  buildReportingSubtreeIds,
  isEligibleJointCallParticipant,
  isEligibleManagerParticipant
} from '../middleware/fieldForceAuth.js';

const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10);

const BDM_TYPES = ['individual', 'joint', 'camp', 'meeting', 'sick', 'leave'];
const MANAGER_TYPES = ['fieldcall', 'jointcall', 'camp', 'meeting', 'sick', 'leave'];

/**
 * POST /api/work-type — set (upsert) the caller's work type for a day.
 *
 * `sick`/`leave` never store leave data on this document — they create a
 * real LeaveRequest via the existing Leave module (client decision: reuse
 * the existing leave system rather than duplicating it) and only keep a
 * link back to it.
 */
export const upsertWorkType = asyncHandler(async (req, res) => {
  const { date, type, details = {} } = req.body;
  const tier = req.user.employeeDetails?.fieldForce?.tier;

  // The demo presents two distinct type sets (BDM vs manager screens) — a
  // manager cannot log "individual call" (that is a BDM/DCR concept) and a
  // BDM cannot log "field call" (a manager-only concept).
  if (tier === 'BDM' && !BDM_TYPES.includes(type)) {
    throw new ApiError(400, `Work type "${type}" is not valid for a BDM`);
  }
  if (tier && tier !== 'BDM' && !MANAGER_TYPES.includes(type)) {
    throw new ApiError(400, `Work type "${type}" is not valid for a manager`);
  }

  if (details.accompaniedBy) {
    const eligible = await isEligibleJointCallParticipant(req.user._id, details.accompaniedBy);
    if (!eligible) {
      throw new ApiError(403, 'accompaniedBy must be an eligible manager above you or a BDM on your own team');
    }
  }

  // A Meeting is an internal activity: either with an eligible manager
  // (ASM/RSM/ZSM/NSM — never Admin, never a BDM peer) or with "team"
  // (Team Meeting — not a real user, so it is stored as the literal string
  // 'team' inside the existing loosely-typed `details`, not a fake user id).
  if (type === 'meeting') {
    const { meetingWith } = details;
    if (!meetingWith) throw new ApiError(400, 'details.meetingWith is required for a meeting ("team" or an eligible manager id)');
    if (meetingWith !== 'team') {
      const eligible = await isEligibleManagerParticipant(req.user._id, meetingWith);
      if (!eligible) throw new ApiError(403, 'details.meetingWith must be an eligible manager (ASM/RSM/ZSM/NSM) above you, or "team"');
    }
  }

  const dateKey = dateKeyOf(date);
  let linkedLeaveRequestId = null;

  if (type === 'sick' || type === 'leave') {
    const { leaveType, fromDate, toDate, reason } = details;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (to < from) throw new ApiError(400, 'details.toDate cannot be before details.fromDate');
    const days = Math.round((to - from) / 86400000) + 1;
    const leave = await LeaveRequest.create({ userId: req.user._id, type: leaveType, fromDate: from, toDate: to, days, reason });
    linkedLeaveRequestId = leave._id;
  }

  const workType = await WorkType.findOneAndUpdate(
    { userId: req.user._id, dateKey },
    { $set: { date: new Date(date), type, details, linkedLeaveRequestId }, $setOnInsert: { userId: req.user._id, dateKey } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  await logActivity({
    actor: req.user, action: 'workType.set', entityType: 'WorkType', entityId: workType._id,
    message: `Work type set to "${type}" for ${dateKey}`
  });

  res.status(200).json({ success: true, message: 'Work type saved', workType });
});

/** GET /api/work-type?date=&month=&year= — the caller's own work-type log. */
export const listMyWorkType = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.date) filter.dateKey = String(req.query.date);
  const workTypes = await WorkType.find(filter).populate('linkedLeaveRequestId', 'type status').sort({ dateKey: -1 });
  res.status(200).json({ success: true, data: workTypes });
});

/** GET /api/work-type/team — ASM+ read-only, reporting-subtree scoped. */
export const listTeamWorkType = asyncHandler(async (req, res) => {
  const filter = {};
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  }
  if (req.query.date) filter.dateKey = String(req.query.date);

  const workTypes = await WorkType.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ dateKey: -1 })
    .limit(2000);
  res.status(200).json({ success: true, data: workTypes });
});
