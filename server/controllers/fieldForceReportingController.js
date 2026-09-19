import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday from '../models/Holiday.js';
import WorkType from '../models/WorkType.js';
import DailyCallReport from '../models/DailyCallReport.js';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import Expense from '../models/Expense.js';
import Doctor from '../models/Doctor.js';
import SecondarySale from '../models/SecondarySale.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { paisaToRupees } from '../utils/money.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds, canAccessFieldOpsUser, buildReportingChainAbove, resolveJointCallParticipants } from '../middleware/fieldForceAuth.js';

const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10);
const todayKey = () => dateKeyOf(new Date());
const currentMonth = () => new Date().toISOString().slice(0, 7);

const getWorkingDaysInMonth = (year, month) => {
  const workingDays = [];

  const date = new Date(Date.UTC(year, month - 1, 1));

  while (date.getUTCMonth() === month - 1) {
    const day = date.getUTCDay();

    // Monday = 1, Tuesday = 2, ..., Friday = 5
    if (day >= 1 && day <= 5) {
      workingDays.push(dateKeyOf(date));
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }

  return workingDays;
};

const getSubmittedDcrDays = async (userId, workingDays) => {
  const submittedDcrDays = await DailyCallReport.distinct('dateKey', {
    userId,
    dateKey: { $in: workingDays },
    submittedAt: { $ne: null }
  });

  return submittedDcrDays;
};

/**
 * GET /api/field-force/my-chain — the caller's own reporting-manager chain
 * (their manager, that manager's manager, and so on), as real user records.
 *
 * Exists so the mobile app can offer a genuine "who accompanied you" picker
 * for joint DCR calls / joint work-type entries that is impossible to game —
 * the backend has already validated every one of these ids belongs to the
 * caller's own chain; the client never has to (and cannot) supply an
 * arbitrary manager id and have it accepted.
 */
export const getMyReportingChain = asyncHandler(async (req, res) => {
  const chainIds = [...(await buildReportingChainAbove(req.user._id))];
  const managers = await User.find({ _id: { $in: chainIds } })
    .select('personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce');
  res.status(200).json({ success: true, data: managers });
});

/**
 * GET /api/field-force/joint-call-participants — the caller's own eligible
 * Joint Call companions / Manager Meeting participants, split into
 * `managers` (real ASM/RSM/ZSM/NSM above them — never Admin) and `others`
 * (same-ASM/team BDMs — never a company-wide BDM list). See
 * `resolveJointCallParticipants` for the authorization rule; the client
 * only ever gets to choose among what this endpoint actually returns, and
 * `createDcr`/`upsertWorkType` independently re-derive the same set on
 * submit rather than trusting whatever the client remembered from this call.
 */
export const getJointCallParticipants = asyncHandler(async (req, res) => {
  const participants = await resolveJointCallParticipants(req.user._id);
  res.status(200).json({ success: true, data: participants });
});

/**
 * GET /api/field-force/calendar?month=YYYY-MM&userId=
 *
 * Raw per-source data for the "Status Calendar" screen — Attendance, Leave,
 * Holiday (all existing/reused), plus WorkType (new). Merging into a single
 * day-by-day view is left to the client, since the exact precedence rule
 * (e.g. "holiday beats leave beats absent") is a presentation choice the
 * demo shows but was never specified as a hard backend rule.
 *
 * `userId` defaults to the caller; a manager may request it for anyone
 * within their reporting-hierarchy scope only (never an arbitrary id).
 */
export const getCalendar = asyncHandler(async (req, res) => {
  const month = String(req.query.month || currentMonth());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, 'month must be in YYYY-MM format');

  let userId = req.user._id;
  if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    if (!(await canAccessFieldOpsUser(req.user, req.query.userId))) {
      throw new ApiError(403, 'You are not authorized to view this user\'s calendar');
    }
    userId = req.query.userId;
  }

  const [y, m] = month.split('-').map(Number);
  const range = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };

  const [attendance, leaves, holidays, workTypes] = await Promise.all([
    Attendance.find({ userId, date: range }).select('dateKey status checkIn checkOut'),
    LeaveRequest.find({ userId, fromDate: { $lte: range.$lt }, toDate: { $gte: range.$gte } }).select('type fromDate toDate status'),
    Holiday.find({ date: range }).select('dateKey name optional'),
    WorkType.find({ userId, dateKey: { $gte: `${month}-01`, $lte: `${month}-31` } }).select('dateKey type details')
  ]);

  res.status(200).json({ success: true, data: { month, attendance, leaves, holidays, workTypes } });
});

/**
 * GET /api/field-force/alerts — a BDM's own combined alert feed (doctor
 * birthdays/anniversaries + secondary-sale expiry), each tagged with `source`
 * so the mobile client can route/icon them without a second round trip.
 */
export const getMyAlerts = asyncHandler(async (req, res) => {
  const doctors = await Doctor.find({
    assignedTo: req.user._id,
    $or: [{ dob: { $ne: null } }, { anniversaryDate: { $ne: null } }]
  }).select('name dob anniversaryDate');

  const today = new Date();
  const withinWindow = (date, days = 7) => {
    if (!date) return false;
    const d = new Date(date);
    const next = new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    let diff = Math.round((next - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000);
    if (diff < 0) diff += 365;
    return diff >= 0 && diff <= days;
  };

  const alerts = [];
  for (const doc of doctors) {
    if (withinWindow(doc.dob)) alerts.push({ source: 'doctor', type: 'birthday', name: doc.name, date: doc.dob });
    if (withinWindow(doc.anniversaryDate)) alerts.push({ source: 'doctor', type: 'anniversary', name: doc.name, date: doc.anniversaryDate });
  }

  const in30Days = new Date(Date.now() + 30 * 86400000);
  const expiring = await SecondarySale.find({ userId: req.user._id, expiryDate: { $ne: null, $lte: in30Days } })
    .select('productName batchNumber expiryDate quantity');
  for (const batch of expiring) {
    alerts.push({ source: 'secondarySale', type: 'expiry', name: `${batch.productName} (${batch.batchNumber || 'no batch'})`, date: batch.expiryDate });
  }

  alerts.sort((a, b) => new Date(a.date) - new Date(b.date));
  res.status(200).json({ success: true, data: alerts });
});

/**
 * GET /api/field-force/dashboard — a BDM's own dashboard stats, computed
 * live from the underlying collections (never hardcoded, per the mobile
 * requirement that no demo numbers reach production).
 */
export const getMyDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const today = todayKey();
  const month = currentMonth();
  const [year, monthNumber] = month.split('-').map(Number);

  const workingDays = getWorkingDaysInMonth(year, monthNumber);

  const submittedDcrDays = await getSubmittedDcrDays(
    userId,
    workingDays
  );

  const dcrSubmittedDays = submittedDcrDays.length;

  const dcrWorkingDays = workingDays.length;

  const dcrSubmissionPercentage = dcrWorkingDays > 0
    ? Math.round((dcrSubmittedDays / dcrWorkingDays) * 100)
    : 0;

  const [todaysCalls, pendingDcrCount, todaysExpenses, mtpsThisMonth, alertsCount] = await Promise.all([
    DailyCallReport.countDocuments({ userId, dateKey: today, type: { $ne: 'missed' } }),
    // Now that a per-call `status` exists, "pending" means today's calls still
    // awaiting completion — not merely "not yet submitted" across all history.
    DailyCallReport.countDocuments({ userId, dateKey: today, status: 'pending' }),
    Expense.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), date: { $gte: new Date(`${today}T00:00:00.000Z`), $lte: new Date(`${today}T23:59:59.999Z`) } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    // A BDM may hold several independent tour plans within one month — the
    // dashboard reports counts by status, never a single collapsed status.
    MonthlyTourPlan.find({ userId, month }).select('status'),
    (async () => {
      const doctorCount = await Doctor.countDocuments({
        assignedTo: userId,
        $or: [{ dob: { $ne: null } }, { anniversaryDate: { $ne: null } }]
      });
      const expiringCount = await SecondarySale.countDocuments({ userId, expiryDate: { $ne: null, $lte: new Date(Date.now() + 30 * 86400000) } });
      return doctorCount + expiringCount; // upper bound; exact per-item filtering happens in /alerts
    })()
  ]);

  res.status(200).json({
    success: true,
    data: {
      todaysCalls,
      pendingDcrCount,
      todaysExpenseTotal: paisaToRupees(todaysExpenses[0]?.total || 0),
      mtpToursThisMonth: mtpsThisMonth.length,
      mtpPendingThisMonth: mtpsThisMonth.filter((p) => p.status === 'pending').length,
      alertsCount,
      dcrSubmittedDays,
      dcrWorkingDays,
      dcrSubmissionPercentage
    }
  });
});

/**
 * GET /api/field-force/monitor — ASM+ team-level or admin/superadmin
 * company-wide roll-up, computed live (no hardcoded percentages).
 */
export const getMonitor = asyncHandler(async (req, res) => {
  const companyWide = hasCompanyWideFieldOpsAccess(req.user);
  let scopeFilter = {};
  let teamMemberFilter = { 'employeeDetails.fieldForce.tier': { $ne: null } };

  if (!companyWide) {
    const subtree = [...(await buildReportingSubtreeIds(req.user._id))];
    scopeFilter = { userId: { $in: subtree } };
    teamMemberFilter = { _id: { $in: subtree } };
  }

  const month = String(req.query.month || currentMonth());
  const [year, monthNumber] = month.split('-').map(Number);
  const workingDays = getWorkingDaysInMonth(year, monthNumber);
  const today = todayKey();
  const elapsedWorkingDays = workingDays.filter((d) => d <= today);
  const targetWorkingDays = elapsedWorkingDays.length > 0 ? elapsedWorkingDays : workingDays;

  const [
    teamSize,
    bdmCount,
    bdmUsers,
    dcrToday,
    pendingMtp,
    approvedMtp,
    totalVisits,
    pendingExpense,
    approvedPlans
  ] = await Promise.all([
    User.countDocuments(teamMemberFilter),
    User.countDocuments({ ...teamMemberFilter, 'employeeDetails.fieldForce.tier': 'BDM' }),
    User.find({ ...teamMemberFilter, 'employeeDetails.fieldForce.tier': 'BDM' }).select('_id').lean(),
    DailyCallReport.distinct('userId', { ...scopeFilter, dateKey: todayKey() }).then((ids) => ids.length),
    MonthlyTourPlan.countDocuments({ ...scopeFilter, month, status: 'pending' }),
    MonthlyTourPlan.countDocuments({ ...scopeFilter, month, status: 'approved' }),
    DailyCallReport.countDocuments({ ...scopeFilter, dateKey: { $gte: `${month}-01`, $lte: `${month}-31` } }),
    Expense.countDocuments({ ...scopeFilter, status: 'pending' }),
    MonthlyTourPlan.find({ ...scopeFilter, month, status: 'approved' }).select('plannedVisits userId').lean()
  ]);

  const bdmIds = bdmUsers.map((u) => u._id);

  // DCR rate: % of working days on which BDMs submitted DCRs
  let dcrRate = 0;
  if (bdmIds.length > 0 && targetWorkingDays.length > 0) {
    const submittedDays = await DailyCallReport.find({
      userId: { $in: bdmIds },
      dateKey: { $in: targetWorkingDays },
      submittedAt: { $ne: null }
    }).select('userId dateKey').lean();

    const uniqueBdmDays = new Set(submittedDays.map((r) => `${r.userId}_${r.dateKey}`)).size;
    const totalExpectedDays = bdmIds.length * targetWorkingDays.length;
    dcrRate = totalExpectedDays > 0 ? Math.min(100, Math.round((uniqueBdmDays / totalExpectedDays) * 100)) : 0;
  }

  // MTP adherence: % of planned visits on approved MTPs that have DCR logs
  let mtpAdherence = 0;
  let totalPlannedVisits = 0;
  approvedPlans.forEach((plan) => {
    totalPlannedVisits += plan.plannedVisits?.length || 0;
  });

  if (totalPlannedVisits > 0) {
    const matchingVisits = await DailyCallReport.countDocuments({
      ...scopeFilter,
      dateKey: { $gte: `${month}-01`, $lte: `${month}-31` },
      type: { $ne: 'missed' }
    });
    mtpAdherence = Math.min(100, Math.round((matchingVisits / totalPlannedVisits) * 100));
  } else if (approvedMtp > 0) {
    mtpAdherence = 100;
  }

  const pendingMtpAll = pendingMtp > 0 ? pendingMtp : await MonthlyTourPlan.countDocuments({ ...scopeFilter, status: 'pending' });

  res.status(200).json({
    success: true,
    data: {
      teamSize,
      bdmCount: bdmCount > 0 ? bdmCount : teamSize,
      dcrSubmittedTodayCount: dcrToday,
      pendingMtpCount: pendingMtpAll,
      approvedMtpCount: approvedMtp,
      totalVisits,
      dcrRate,
      mtpAdherence,
      pendingExpenseCount: pendingExpense,
      month
    }
  });
});

/**
 * GET /api/field-force/team-performance?month=YYYY-MM — the same DCR/MTP
 * computation `getMonitor` already does, broken out per BDM instead of
 * summed across the whole subtree, for the manager "Team" screen's
 * per-person performance cards. Scoped identically to `getMonitor` (own
 * reporting subtree, or company-wide for admin/superadmin) — never a
 * company-wide BDM list for a tiered manager.
 *
 * `status` is a derived at-a-glance classification, computed here and never
 * stored: dcrRate >=85 -> 'top', >=65 -> 'active', >=45 -> 'review', else
 * 'low'. 'top'/'active' count as "on target"; 'review'/'low' count as
 * "needs review" in `summary`. These thresholds are a presentation choice
 * (no pre-existing business rule defines them) — documented here as the
 * single source of truth rather than duplicated in the mobile client.
 */
export const getTeamPerformance = asyncHandler(async (req, res) => {
  const companyWide = hasCompanyWideFieldOpsAccess(req.user);
  let teamMemberFilter = { 'employeeDetails.fieldForce.tier': 'BDM' };
  if (!companyWide) {
    const subtree = [...(await buildReportingSubtreeIds(req.user._id))];
    teamMemberFilter = { _id: { $in: subtree }, 'employeeDetails.fieldForce.tier': 'BDM' };
  }

  const month = String(req.query.month || currentMonth());
  const [year, monthNumber] = month.split('-').map(Number);
  const workingDays = getWorkingDaysInMonth(year, monthNumber);
  const today = todayKey();
  const elapsedWorkingDays = workingDays.filter((d) => d <= today);
  const targetWorkingDays = elapsedWorkingDays.length > 0 ? elapsedWorkingDays : workingDays;

  const bdms = await User.find(teamMemberFilter)
    .select('personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce employeeDetails.employeeId isActive')
    .lean();

  const data = await Promise.all(bdms.map(async (bdm) => {
    const [submittedDcrDays, visitDays, approvedPlans] = await Promise.all([
      getSubmittedDcrDays(bdm._id, targetWorkingDays),
      DailyCallReport.distinct('dateKey', { userId: bdm._id, dateKey: { $gte: `${month}-01`, $lte: `${month}-31` }, type: { $ne: 'missed' } }),
      MonthlyTourPlan.find({ userId: bdm._id, month, status: 'approved' }).select('plannedVisits').lean()
    ]);

    const dcrRate = targetWorkingDays.length > 0
      ? Math.min(100, Math.round((submittedDcrDays.length / targetWorkingDays.length) * 100))
      : 0;

    let totalPlannedVisits = 0;
    approvedPlans.forEach((plan) => { totalPlannedVisits += plan.plannedVisits?.length || 0; });
    let mtpAdherence = 0;
    if (totalPlannedVisits > 0) {
      // eslint-disable-next-line no-await-in-loop
      const matchingVisits = await DailyCallReport.countDocuments({
        userId: bdm._id, dateKey: { $gte: `${month}-01`, $lte: `${month}-31` }, type: { $ne: 'missed' }
      });
      mtpAdherence = Math.min(100, Math.round((matchingVisits / totalPlannedVisits) * 100));
    } else if (approvedPlans.length > 0) {
      mtpAdherence = 100;
    }

    let status;
    if (dcrRate >= 85) status = 'top';
    else if (dcrRate >= 65) status = 'active';
    else if (dcrRate >= 45) status = 'review';
    else status = 'low';

    return {
      userId: bdm._id,
      name: `${bdm.personalDetails?.firstName || ''} ${bdm.personalDetails?.lastName || ''}`.trim(),
      employeeId: bdm.employeeDetails?.employeeId || null,
      territory: bdm.employeeDetails?.fieldForce?.territory || null,
      isActive: Boolean(bdm.isActive),
      dcrRate,
      mtpAdherence,
      visitDays: visitDays.length,
      workingDays: targetWorkingDays.length,
      status
    };
  }));

  const summary = {
    totalBdms: data.length,
    onTarget: data.filter((d) => d.status === 'top' || d.status === 'active').length,
    needsReview: data.filter((d) => d.status === 'review' || d.status === 'low').length
  };

  res.status(200).json({ success: true, month, summary, data });
});

/**
 * GET /api/field-force/team-attendance?period=today|week|month — the
 * caller's own reporting subtree's BDM attendance, scoped identically to
 * `getMonitor`/`getTeamPerformance` (own subtree, or company-wide for
 * admin/superadmin) — a manager can never see a BDM outside their own
 * hierarchy. Reuses the existing Attendance + LeaveRequest models and the
 * same "no punch record + an active approved leave = Leave" derivation
 * `getTodayAttendance` already uses for a single caller — no new collection.
 *
 * `period=today` returns each BDM's real-time punch status; `week`/`month`
 * return a present-days-in-range count instead (a live "punched in" state
 * doesn't carry meaning over a multi-day range). `monthlySummary` is always
 * the current month regardless of the selected period, matching the
 * prototype's fixed "Monthly Summary" section.
 */
export const getTeamAttendance = asyncHandler(async (req, res) => {
  const companyWide = hasCompanyWideFieldOpsAccess(req.user);
  let teamMemberFilter = { 'employeeDetails.fieldForce.tier': 'BDM' };
  if (!companyWide) {
    const subtree = [...(await buildReportingSubtreeIds(req.user._id))];
    teamMemberFilter = { _id: { $in: subtree }, 'employeeDetails.fieldForce.tier': 'BDM' };
  }

  const period = ['today', 'week', 'month'].includes(req.query.period) ? req.query.period : 'today';
  const bdms = await User.find(teamMemberFilter)
    .select('personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce employeeDetails.employeeId')
    .lean();
  const bdmIds = bdms.map((u) => u._id);

  const now = new Date();
  const today = todayKey();
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const todayEnd = new Date(`${today}T23:59:59.999Z`);

  let rangeStart;
  if (period === 'week') {
    const day = now.getUTCDay(); // 0 = Sunday
    const diffToMonday = (day + 6) % 7;
    rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
  } else if (period === 'month') {
    rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  } else {
    rangeStart = todayStart;
  }
  const rangeEnd = todayEnd;

  const [todayRecords, rangeRecords, activeLeaves] = await Promise.all([
    Attendance.find({ userId: { $in: bdmIds }, dateKey: today }).select('userId punchInAt punchOutAt status'),
    Attendance.find({ userId: { $in: bdmIds }, date: { $gte: rangeStart, $lte: rangeEnd } }).select('userId dateKey status punchInAt'),
    LeaveRequest.find({ userId: { $in: bdmIds }, status: 'Approved', fromDate: { $lte: todayEnd }, toDate: { $gte: todayStart } }).select('userId')
  ]);

  const todayByUser = new Map(todayRecords.map((r) => [String(r.userId), r]));
  const leaveUserIds = new Set(activeLeaves.map((l) => String(l.userId)));
  const rangeByUser = new Map();
  rangeRecords.forEach((r) => {
    const key = String(r.userId);
    if (!rangeByUser.has(key)) rangeByUser.set(key, []);
    rangeByUser.get(key).push(r);
  });

  const workingDaysInRange = [];
  for (let cur = new Date(rangeStart); cur <= rangeEnd; cur.setUTCDate(cur.getUTCDate() + 1)) {
    const wd = cur.getUTCDay();
    if (wd >= 1 && wd <= 5) workingDaysInRange.push(dateKeyOf(cur));
  }

  const rows = bdms.map((bdm) => {
    const id = String(bdm._id);
    const name = `${bdm.personalDetails?.firstName || ''} ${bdm.personalDetails?.lastName || ''}`.trim();
    const employeeId = bdm.employeeDetails?.employeeId || null;
    const territory = bdm.employeeDetails?.fieldForce?.territory || null;
    const onLeaveToday = leaveUserIds.has(id);

    if (period === 'today') {
      const todayRecord = todayByUser.get(id);
      const punchedIn = Boolean(todayRecord?.punchInAt);
      return {
        userId: bdm._id, name, employeeId, territory,
        status: onLeaveToday ? 'leave' : punchedIn ? 'in' : 'out',
        punchInAt: todayRecord?.punchInAt || null,
        punchOutAt: todayRecord?.punchOutAt || null
      };
    }

    const periodRecords = rangeByUser.get(id) || [];
    const presentDays = new Set(
      periodRecords.filter((r) => r.status === 'Present' || r.punchInAt).map((r) => r.dateKey)
    ).size;
    return {
      userId: bdm._id, name, employeeId, territory,
      status: onLeaveToday ? 'leave' : null,
      presentDays,
      workingDays: workingDaysInRange.length
    };
  });

  const summary = {
    totalBdms: bdms.length,
    punchedIn: rows.filter((r) => r.status === 'in').length,
    notIn: period === 'today'
      ? rows.filter((r) => r.status === 'out').length
      : rows.filter((r) => !r.status && r.presentDays === 0).length,
    onLeave: rows.filter((r) => r.status === 'leave').length
  };

  // Monthly summary — always the current month, independent of the
  // selected period tab (mirrors the prototype's fixed section).
  const monthKeyStr = today.slice(0, 7);
  const monthStart = new Date(`${monthKeyStr}-01T00:00:00.000Z`);
  const monthRecords = await Attendance.find({
    userId: { $in: bdmIds }, date: { $gte: monthStart, $lte: todayEnd }
  }).select('userId dateKey status punchInAt');
  const [monthYear, monthNum] = monthKeyStr.split('-').map(Number);
  const workingDaysThisMonth = getWorkingDaysInMonth(monthYear, monthNum).filter((d) => d <= today);

  const punchMinutes = [];
  let presentDayTotal = 0;
  monthRecords.forEach((r) => {
    if (r.status === 'Present' || r.punchInAt) {
      presentDayTotal += 1;
      if (r.punchInAt) {
        const d = new Date(r.punchInAt);
        punchMinutes.push((d.getUTCHours() * 60) + d.getUTCMinutes());
      }
    }
  });
  const avgPunchInMinutes = punchMinutes.length
    ? Math.round(punchMinutes.reduce((a, b) => a + b, 0) / punchMinutes.length)
    : null;
  const avgPunchInTime = avgPunchInMinutes == null ? null
    : `${String(Math.floor(avgPunchInMinutes / 60) % 24).padStart(2, '0')}:${String(avgPunchInMinutes % 60).padStart(2, '0')}`;

  const [absentWithoutReason, onApprovedLeave] = await Promise.all([
    Attendance.countDocuments({ userId: { $in: bdmIds }, dateKey: { $in: workingDaysThisMonth }, status: 'Absent' }),
    LeaveRequest.countDocuments({
      userId: { $in: bdmIds }, status: 'Approved', fromDate: { $lte: todayEnd }, toDate: { $gte: monthStart }
    })
  ]);

  const monthlySummary = {
    month: monthKeyStr,
    avgPunchInTime,
    presentDaysAvg: bdmIds.length > 0 ? Math.round((presentDayTotal / bdmIds.length) * 10) / 10 : 0,
    workingDaysThisMonth: workingDaysThisMonth.length,
    absentWithoutReason,
    onApprovedLeave
  };

  res.status(200).json({ success: true, period, summary, rows, monthlySummary });
});

