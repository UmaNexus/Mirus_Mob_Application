import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import ExitRecord from '../models/ExitRecord.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  parseMirusAttendanceWorkbook,
  parseSingleDayAttendanceWorkbook,
  normalizePhoneDigits
} from '../services/mirusAttendanceImport.js';
import { PERMISSIONS, roleHasPermission } from '../config/permissions.js';
import { buildReportingSubtreeIds, canAccessFieldOpsUser } from '../middleware/fieldForceAuth.js';
import { buildApprovalInfo } from '../utils/approvalInfo.js';
import { dispatchNotification } from '../services/notificationService.js';

const LEAVE_APPROVER_SELECT = 'personalDetails.firstName personalDetails.lastName role employeeDetails.fieldForce employeeDetails.employeeId';


const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10); // 'YYYY-MM-DD'

/** Parse YYYY-MM-DD (or ISO / Date) as UTC calendar-day start/end — avoids TZ drift. */
const utcDayStart = (value) => {
  const str = value instanceof Date ? value.toISOString() : String(value || '');
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(value);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0));
};
const utcDayEnd = (value) => {
  const str = value instanceof Date ? value.toISOString() : String(value || '');
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(value);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999));
};

// Build an inclusive month range [start, nextMonthStart) for filtering.
const monthRange = (month, year) => {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!m || !y) return null;
  return { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
};

// ---------- Attendance ----------

const upsertAttendance = async ({ userId, body, markedBy }) => {
  const date = body.date ? new Date(body.date) : new Date();
  const dateKey = dateKeyOf(date);

  // Guard against recording attendance for dates past the employee's last working day
  const exit = await ExitRecord.findOne({
    userId,
    status: { $in: ['Initiated', 'InProgress', 'Completed'] }
  }).select('lastWorkingDay');

  if (exit?.lastWorkingDay && dateKey > dateKeyOf(exit.lastWorkingDay)) {
    throw new ApiError(400, `Cannot record attendance for dates after employee's last working day (${dateKeyOf(exit.lastWorkingDay)})`);
  }

  const update = {
    date,
    status: body.status || 'Present',
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    workedHours: body.workedHours ?? 0,
    isOvertime: Boolean(body.isOvertime),
    overtimeHours: body.overtimeHours ?? 0,
    notes: body.notes,
    markedBy
  };
  return Attendance.findOneAndUpdate(
    { userId, dateKey },
    { $set: update, $setOnInsert: { userId, dateKey } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
};

/** POST /api/attendance/mark — employee marks their own attendance for a day. */
export const markMyAttendance = asyncHandler(async (req, res) => {
  const record = await upsertAttendance({ userId: req.user._id, body: req.body, markedBy: req.user._id });
  res.status(200).json({ success: true, message: 'Attendance recorded', record });
});

/** GET /api/attendance/mine?month&year&from&to — the caller's attendance. */
export const listMyAttendance = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  const range = monthRange(req.query.month, req.query.year);
  if (range) {
    filter.date = range;
  } else if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);
      filter.date.$lte = to;
    }
  }
  const records = await Attendance.find(filter).sort({ date: -1 });
  res.status(200).json({ success: true, data: records });
});

/**
 * POST /api/attendance/punch-in — real timestamped punch for the mobile
 * field-force app (Milestone 6). Additive to the existing whole-day-status
 * model: upserts today's record, stamping `punchInAt` without disturbing the
 * `checkIn`/`checkOut` free-text fields HR's bulk-marking tools use.
 */
export const punchIn = asyncHandler(async (req, res) => {
  const now = new Date();
  const dateKey = dateKeyOf(now);

  const exit = await ExitRecord.findOne({
    userId: req.user._id,
    status: { $in: ['Initiated', 'InProgress', 'Completed'] }
  }).select('lastWorkingDay');

  if (exit?.lastWorkingDay && dateKey > dateKeyOf(exit.lastWorkingDay)) {
    throw new ApiError(403, `Cannot punch in after your last working day (${dateKeyOf(exit.lastWorkingDay)})`);
  }

  const existing = await Attendance.findOne({ userId: req.user._id, dateKey });
  if (existing?.punchInAt && !existing?.punchOutAt) {
    throw new ApiError(400, 'Already punched in — punch out first');
  }
  const record = await Attendance.findOneAndUpdate(
    { userId: req.user._id, dateKey },
    { $set: { date: now, status: 'Present', punchInAt: now, punchOutAt: null }, $setOnInsert: { userId: req.user._id, dateKey } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  res.status(200).json({ success: true, message: 'Punched in', record });
});

/** POST /api/attendance/punch-out — closes today's open punch, computing worked hours. */
export const punchOut = asyncHandler(async (req, res) => {
  const now = new Date();
  const dateKey = dateKeyOf(now);
  const existing = await Attendance.findOne({ userId: req.user._id, dateKey });
  if (!existing?.punchInAt) throw new ApiError(400, 'You have not punched in today');
  if (existing.punchOutAt) throw new ApiError(400, 'Already punched out');

  existing.punchOutAt = now;
  existing.workedHours = Math.round(((now - existing.punchInAt) / 3600000) * 100) / 100;
  await existing.save();
  res.status(200).json({ success: true, message: 'Punched out', record: existing });
});

/** GET /api/attendance/today — the caller's own punch state for today (or null). */
export const getTodayAttendance = asyncHandler(async (req, res) => {
  const now = new Date();
  const dateKey = dateKeyOf(now);
  const todayStart = utcDayStart(dateKey);
  const todayEnd = utcDayEnd(dateKey);

  const [record, activeLeave] = await Promise.all([
    Attendance.findOne({ userId: req.user._id, dateKey }),
    LeaveRequest.findOne({
      userId: req.user._id,
      status: 'Approved',
      fromDate: { $lte: todayEnd },
      toDate: { $gte: todayStart }
    })
  ]);

  let resultRecord = record ? record.toObject() : null;
  if (!resultRecord && activeLeave) {
    resultRecord = {
      dateKey,
      status: 'Leave'
    };
  }
  if (resultRecord) {
    resultRecord.activeLeave = activeLeave || null;
  }

  res.status(200).json({ success: true, record: resultRecord, activeLeave: activeLeave || null });
});

/** POST /api/attendance — HR marks/edits attendance for an employee. */
export const markAttendance = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.userId)) throw new ApiError(400, 'Valid userId is required');
  const record = await upsertAttendance({ userId: req.body.userId, body: req.body, markedBy: req.user._id });
  res.status(200).json({ success: true, message: 'Attendance recorded', record });
});

/**
 * POST /api/attendance/bulk — HR records the same-day status for many employees
 * at once. Body: { userIds:[], date, status, checkIn?, checkOut? }
 */
export const markBulkAttendance = asyncHandler(async (req, res) => {
  const { userIds, date, status, checkIn, checkOut } = req.body;
  if (!Array.isArray(userIds) || !userIds.length) throw new ApiError(400, 'userIds must be a non-empty array');
  const valid = userIds.filter((id) => mongoose.isValidObjectId(id));
  if (!valid.length) throw new ApiError(400, 'No valid userIds provided');

  let count = 0;
  for (const userId of valid) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await upsertAttendance({ userId, body: { date, status, checkIn, checkOut }, markedBy: req.user._id });
      count += 1;
    } catch (err) {
      if (err.statusCode === 400 && err.message?.includes('last working day')) {
        continue;
      }
      throw err;
    }
  }
  res.status(200).json({ success: true, message: `Attendance recorded for ${count} employee(s)`, count });
});

// Read a cell as a plain value (handles rich-text / hyperlink / formula cells).
const cellVal = (row, idx) => {
  if (!idx) return null;
  const v = row.getCell(idx).value;
  if (v && typeof v === 'object' && 'text' in v) return v.text;
  if (v && typeof v === 'object' && 'result' in v) return v.result;
  return v;
};

/** Resolve employee by Emp.Id, then phone digits, then exact full name. */
const resolveAttendanceUser = async ({ empId, phoneDigits, name }) => {
  if (empId) {
    const byId = await User.findOne({
      'employeeDetails.employeeId': String(empId).trim().toUpperCase()
    }).select('_id employeeDetails.employeeId');
    if (byId) return byId;
  }
  if (phoneDigits && phoneDigits.length >= 10) {
    const users = await User.find({
      $or: [
        { 'contactInfo.personalMobile': { $regex: `${phoneDigits.slice(-10)}$` } },
        { 'contactInfo.workMobile': { $regex: `${phoneDigits.slice(-10)}$` } }
      ]
    }).select('_id contactInfo.personalMobile contactInfo.workMobile').limit(5);
    const match = users.find((u) => {
      const a = normalizePhoneDigits(u.contactInfo?.personalMobile);
      const b = normalizePhoneDigits(u.contactInfo?.workMobile);
      return a.endsWith(phoneDigits.slice(-10)) || b.endsWith(phoneDigits.slice(-10));
    });
    if (match) return match;
  }
  if (name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const first = parts[0];
      const last = parts.slice(1).join(' ') || '-';
      const byName = await User.findOne({
        'personalDetails.firstName': new RegExp(`^${esc(first)}$`, 'i'),
        'personalDetails.lastName': new RegExp(`^${esc(last)}$`, 'i')
      }).select('_id');
      if (byName) return byName;
    }
  }
  return null;
};

/**
 * Import Mirus monthly matrix (Emp.Id × days with P/A/L).
 * @param {ReturnType<typeof parseMirusAttendanceWorkbook>} parsed
 */
const importMirusAttendance = async (parsed, markedBy) => {
  const results = {
    format: 'mirus',
    imported: [],
    failed: [...parsed.errors],
    skippedEmpty: parsed.skippedEmpty || 0,
    skippedSunday: parsed.skippedSunday || 0,
    sheets: parsed.sheets
  };

  // Cache Emp.Id → user for the file
  const userCache = new Map();

  for (const mark of parsed.marks) {
    try {
      let user = userCache.get(mark.empId);
      if (user === undefined) {
        user = await resolveAttendanceUser({
          empId: mark.empId,
          phoneDigits: mark.phoneDigits,
          name: mark.name
        });
        userCache.set(mark.empId, user || null);
      }
      if (!user) throw new Error(`Employee not found (${mark.empId})`);

      await upsertAttendance({
        userId: user._id,
        body: { date: mark.date, status: mark.status },
        markedBy
      });
      results.imported.push({
        sheet: mark.sheet,
        row: mark.row,
        employee: mark.empId,
        date: mark.dateKey,
        status: mark.status
      });
    } catch (err) {
      results.failed.push({
        sheet: mark.sheet,
        row: mark.row,
        employee: mark.empId,
        date: mark.dateKey,
        error: err.message
      });
    }
  }

  return results;
};

/**
 * Legacy flat roster: employeeId | email | date | status | checkIn | checkOut
 */
const importLegacyFlatAttendance = async (buffer, markedBy) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The spreadsheet has no worksheets');

  const col = {};
  sheet.getRow(1).eachCell((c, idx) => { col[String(c.value).trim().toLowerCase()] = idx; });
  if (!col.employeeid && !col.email) {
    throw new ApiError(400, 'Sheet must have an "employeeId" or "email" column (or use Mirus Staff Attendance format)');
  }
  if (!col.date) throw new ApiError(400, 'Sheet must have a "date" column');

  const results = { format: 'flat', imported: [], failed: [], skippedEmpty: 0 };
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const empId = col.employeeid ? cellVal(row, col.employeeid) : null;
    const email = col.email ? cellVal(row, col.email) : null;
    if (!empId && !email) continue;

    try {
      const query = empId
        ? { 'employeeDetails.employeeId': String(empId).trim().toUpperCase() }
        : { email: String(email).toLowerCase().trim() };
      const user = await User.findOne(query).select('_id');
      if (!user) throw new Error('Employee not found');

      const date = cellVal(row, col.date);
      const statusRaw = (col.status && cellVal(row, col.status)) || 'Present';
      const statusMap = { P: 'Present', A: 'Absent', L: 'Leave' };
      const status = statusMap[String(statusRaw).trim().toUpperCase()] || statusRaw;

      await upsertAttendance({
        userId: user._id,
        body: {
          date: date ? new Date(date) : new Date(),
          status,
          checkIn: col.checkin ? cellVal(row, col.checkin) : undefined,
          checkOut: col.checkout ? cellVal(row, col.checkout) : undefined
        },
        markedBy
      });
      results.imported.push({ row: r, employee: empId || email });
    } catch (err) {
      results.failed.push({ row: r, employee: empId || email, error: err.message });
    }
  }
  return results;
};

/**
 * POST /api/attendance/bulk-upload — import attendance from .xls / .xlsx.
 *
 * Multipart fields:
 *   roster (file) — required
 *   mode = "month" | "day" — required
 *   month, year — required when mode=month (UI is source of truth for period)
 *   date (YYYY-MM-DD) — required when mode=day
 *
 * Month mode: Mirus matrix; day columns dated with UI month/year.
 * Day mode: flat Emp.Id + Status for that date, or Mirus matrix filtered to that day.
 */
export const bulkUploadAttendance = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "roster")');
  const buffer = req.file.buffer;
  const mode = String(req.body.mode || '').trim().toLowerCase();

  if (!['month', 'day'].includes(mode)) {
    throw new ApiError(400, 'mode is required: "month" (monthly sheet) or "day" (single date)');
  }

  let results;

  if (mode === 'month') {
    const month = parseInt(req.body.month, 10);
    const year = parseInt(req.body.year, 10);
    if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) {
      throw new ApiError(400, 'Select a valid month (1–12) and year for monthly upload');
    }
    const mirus = parseMirusAttendanceWorkbook(buffer, { month, year });
    if (mirus.format !== 'mirus') {
      throw new ApiError(
        400,
        'Monthly upload expects a Mirus Staff Attendance sheet (Emp.Id + weekday headers with day numbers below, marks P/A/L).'
      );
    }
    results = await importMirusAttendance(mirus, req.user._id);
    results.mode = 'month';
    results.period = { month, year };
  } else {
    const dateKey = String(req.body.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new ApiError(400, 'Select a valid date (YYYY-MM-DD) for single-day upload');
    }
    if (new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() === 0) {
      throw new ApiError(400, 'Sundays are blocked for attendance import. Choose another date.');
    }
    const [ys, ms, ds] = dateKey.split('-').map(Number);
    const day = ds;
    const month = ms;
    const year = ys;

    // Prefer a simple Emp.Id + Status sheet for one day; else Mirus matrix for that day column.
    const flatDay = parseSingleDayAttendanceWorkbook(buffer, dateKey);
    if (flatDay.format === 'single-day' && flatDay.marks.length) {
      results = await importMirusAttendance(flatDay, req.user._id);
    } else {
      const mirus = parseMirusAttendanceWorkbook(buffer, { month, year, onlyDay: day });
      if (mirus.format === 'mirus' && (mirus.marks.length || mirus.errors.length)) {
        results = await importMirusAttendance(mirus, req.user._id);
      } else if (flatDay.errors.length) {
        throw new ApiError(
          400,
          flatDay.errors[0]?.error
            || 'Single-day upload expects Emp.Id + Status columns, or a Mirus sheet containing that day.'
        );
      } else {
        throw new ApiError(
          400,
          'Single-day upload expects Emp.Id + Status columns, or a Mirus monthly sheet with that day column.'
        );
      }
    }
    results.mode = 'day';
    results.period = { date: dateKey };
  }

  const skipParts = [];
  if (results.skippedEmpty) skipParts.push(`${results.skippedEmpty} empty cell(s) unchanged`);
  if (results.skippedSunday) skipParts.push(`${results.skippedSunday} Sunday mark(s) blocked`);
  const skipNote = skipParts.length ? `, skipped ${skipParts.join(', ')}` : '';
  res.status(201).json({
    success: true,
    message: `Imported ${results.imported.length}, failed ${results.failed.length}${skipNote}`,
    ...results
  });
});

/** GET /api/attendance?userId&month&year&from&to&status — HR attendance register. */
export const listAttendance = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }
  if (req.query.status) filter.status = req.query.status;

  const range = monthRange(req.query.month, req.query.year);
  if (range) {
    filter.date = range;
  } else if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) {
      const to = new Date(req.query.to);
      // Inclusive end-of-day when a date-only string is passed.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);
      filter.date.$lte = to;
    }
  }

  const records = await Attendance.find(filter)
    .populate('userId', 'email personalDetails.firstName personalDetails.lastName employeeDetails.employeeId')
    .sort({ date: -1 })
    .limit(5000);
  res.status(200).json({ success: true, data: records });
});

// ---------- Leave ----------

/** POST /api/leaves — apply for leave (self). */
export const applyLeave = asyncHandler(async (req, res) => {
  const { type, fromDate, toDate, days, reason } = req.body;
  if (!type || !fromDate || !toDate) throw new ApiError(400, 'type, fromDate and toDate are required');
  // Store as UTC calendar days so list filters match date-picker values in any TZ.
  const from = utcDayStart(fromDate);
  const to = utcDayStart(toDate);
  const toEnd = utcDayEnd(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ApiError(400, 'fromDate and toDate must be valid dates');
  }
  if (to < from) throw new ApiError(400, 'toDate cannot be before fromDate');
  const computedDays = days || (Math.round((to - from) / 86400000) + 1);

  // Prevent overlapping active (Pending or Approved) leave applications
  const overlap = await LeaveRequest.findOne({
    userId: req.user._id,
    status: { $in: ['Pending', 'Approved'] },
    fromDate: { $lte: toEnd },
    toDate: { $gte: from }
  });
  if (overlap) {
    throw new ApiError(400, `You already have a ${overlap.status.toLowerCase()} leave request covering this date.`);
  }

  const leave = await LeaveRequest.create({
    userId: req.user._id, type, fromDate: from, toDate: to, days: computedDays, reason
  });

  const submitter = await User.findById(req.user._id).select('personalDetails employeeDetails.reportingManagerId');
  const managerId = submitter?.employeeDetails?.reportingManagerId;
  const employeeName = [submitter?.personalDetails?.firstName, submitter?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  if (managerId) {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [managerId],
      senderId: req.user._id,
      module: 'leave',
      eventId: 'LEAVE_SUBMITTED',
      title: 'New Leave Application',
      body: `${employeeName} applied for ${type} leave (${computedDays} days: ${fromStr} to ${toStr})`,
      priority: 'high',
      deepLink: 'mirus://manager/approvals?tab=leaves',
      entityType: 'LeaveRequest',
      entityId: leave._id,
      data: { screen: 'ApprovalsScreen', tab: 'leaves', leaveId: leave._id }
    }).catch(() => {});
  }

  res.status(201).json({ success: true, message: 'Leave request submitted', leave });
});

/** GET /api/leaves/mine — caller's leave requests. */
export const listMyLeaves = asyncHandler(async (req, res) => {
  const leaves = await LeaveRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: leaves });
});

/** GET /api/leaves?status&userId&type&from&to — leave register (HR / Manager). */
export const listLeaves = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;

  if (!roleHasPermission(req.user.role, PERMISSIONS.LEAVE_APPROVE)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  }

  // Overlap with [from, to]: leave.fromDate <= endOf(to) AND leave.toDate >= startOf(from)
  if (req.query.from || req.query.to) {
    const from = req.query.from ? utcDayStart(req.query.from) : new Date(Date.UTC(1970, 0, 1));
    const to = req.query.to ? utcDayEnd(req.query.to) : new Date(Date.UTC(2999, 11, 31, 23, 59, 59, 999));
    filter.fromDate = { $lte: to };
    filter.toDate = { $gte: from };
  }

  const leaves = await LeaveRequest.find(filter)
    .populate({
      path: 'userId',
      select: 'email personalDetails.firstName personalDetails.lastName employeeDetails.employeeId employeeDetails.fieldForce employeeDetails.reportingManagerId',
      // LeaveRequest has no designated-approver field of its own (unlike
      // Expense/MTP, `approverId` stays null until decided) — nested-populate
      // the requester's CURRENT manager so a still-pending leave can show
      // "Pending from <name>" (see buildApprovalInfo's `pendingApproverFallback`).
      populate: { path: 'employeeDetails.reportingManagerId', select: LEAVE_APPROVER_SELECT }
    })
    .populate('approverId', LEAVE_APPROVER_SELECT)
    .sort({ createdAt: -1 })
    .limit(1000);

  // `approval` — read-only, additive summary of the ALREADY-STORED decision
  // (see buildApprovalInfo doc comment). Additive only: every existing field
  // is unchanged, so the manager's own approvals inbox (same endpoint,
  // filtered by status=Pending) is unaffected.
  const data = leaves.map((leave) => ({
    ...leave.toObject(),
    approval: buildApprovalInfo(leave, { pendingApproverFallback: leave.userId?.employeeDetails?.reportingManagerId || null })
  }));
  res.status(200).json({ success: true, data });
});

/** PATCH /api/leaves/:id/decision — approve/reject (HR / Manager). Body: { status, note } */
export const decideLeave = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid leave id');
  const { status, note } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) throw new ApiError(400, 'status must be Approved or Rejected');
  const leave = await LeaveRequest.findById(req.params.id);
  if (!leave) throw new ApiError(404, 'Leave request not found');

  const allowed = roleHasPermission(req.user.role, PERMISSIONS.LEAVE_APPROVE) || (await canAccessFieldOpsUser(req.user, leave.userId));
  if (!allowed) throw new ApiError(403, 'You are not authorized to decide this leave request');

  if (leave.status !== 'Pending') throw new ApiError(400, `Leave is already ${leave.status}`);
  leave.status = status;
  leave.approverId = req.user._id;
  leave.decidedAt = new Date();
  leave.decisionNote = note;
  await leave.save();


  if (status === 'Approved') {
    const cur = new Date(leave.fromDate);
    const end = new Date(leave.toDate);
    while (cur <= end) {
      const dKey = dateKeyOf(cur);
      await Attendance.findOneAndUpdate(
        { userId: leave.userId, dateKey: dKey, punchInAt: null },
        { $set: { date: new Date(cur), status: 'Leave', notes: `Approved ${leave.type} leave` }, $setOnInsert: { userId: leave.userId, dateKey: dKey } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const managerName = [req.user?.personalDetails?.firstName, req.user?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Manager';
  const fromStr = new Date(leave.fromDate).toISOString().slice(0, 10);
  const toStr = new Date(leave.toDate).toISOString().slice(0, 10);

  if (status === 'Approved') {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [leave.userId],
      senderId: req.user._id,
      module: 'leave',
      eventId: 'LEAVE_APPROVED',
      title: 'Leave Request Approved',
      body: `Your ${leave.type} leave for ${leave.days} days (${fromStr} to ${toStr}) was approved by ${managerName}`,
      priority: 'high',
      deepLink: 'mirus://bdm/leave',
      entityType: 'LeaveRequest',
      entityId: leave._id,
      data: { screen: 'ApplyLeaveScreen', leaveId: leave._id }
    }).catch(() => {});
  } else {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [leave.userId],
      senderId: req.user._id,
      module: 'leave',
      eventId: 'LEAVE_REJECTED',
      title: 'Leave Request Rejected',
      body: `Your ${leave.type} leave request was rejected by ${managerName}.${note ? ` Reason: "${note}"` : ''}`,
      priority: 'high',
      deepLink: 'mirus://bdm/leave',
      entityType: 'LeaveRequest',
      entityId: leave._id,
      data: { screen: 'ApplyLeaveScreen', leaveId: leave._id, reason: note }
    }).catch(() => {});
  }

  res.status(200).json({ success: true, message: `Leave ${status.toLowerCase()}`, leave });
});

/** PATCH /api/leaves/:id/cancel — employee cancels their own leave. */
export const cancelLeave = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid leave id');
  const leave = await LeaveRequest.findById(req.params.id);
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (String(leave.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only cancel your own leave');
  if (leave.status !== 'Pending') {
  throw new ApiError(400, 'Only pending leave can be cancelled');
  }

  const prevStatus = leave.status;
  leave.status = 'Cancelled';
  await leave.save();

  if (prevStatus === 'Approved') {
    const cur = new Date(leave.fromDate);
    const end = new Date(leave.toDate);
    while (cur <= end) {
      const dKey = dateKeyOf(cur);
      await Attendance.deleteOne({ userId: leave.userId, dateKey: dKey, status: 'Leave', punchInAt: null });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const submitter = await User.findById(req.user._id).select('personalDetails employeeDetails.reportingManagerId');
  const managerId = submitter?.employeeDetails?.reportingManagerId;
  const employeeName = [submitter?.personalDetails?.firstName, submitter?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
  const fromStr = new Date(leave.fromDate).toISOString().slice(0, 10);
  const toStr = new Date(leave.toDate).toISOString().slice(0, 10);

  if (managerId) {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [managerId],
      senderId: req.user._id,
      module: 'leave',
      eventId: 'LEAVE_CANCELLED',
      title: 'Leave Request Cancelled',
      body: `${employeeName} cancelled their leave application for ${fromStr} to ${toStr}`,
      priority: 'medium',
      deepLink: 'mirus://manager/approvals?tab=leaves',
      entityType: 'LeaveRequest',
      entityId: leave._id,
      data: { screen: 'ApprovalsScreen', tab: 'leaves', leaveId: leave._id }
    }).catch(() => {});
  }

  res.status(200).json({ success: true, message: 'Leave cancelled', leave });
});

// ---------- Holidays ----------

/** POST /api/holidays — add a holiday (HR). */
export const createHoliday = asyncHandler(async (req, res) => {
  const { date, name, optional } = req.body;
  if (!date || !name) throw new ApiError(400, 'date and name are required');
  const d = new Date(date);
  const holiday = await Holiday.findOneAndUpdate(
    { dateKey: dateKeyOf(d) },
    { $set: { date: d, name, optional: Boolean(optional) }, $setOnInsert: { dateKey: dateKeyOf(d) } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  // Broadcast to active company employees
  User.find({ isActive: true }).select('_id').lean().then((users) => {
    const recipientIds = users.map((u) => u._id).filter((id) => String(id) !== String(req.user._id));
    if (recipientIds.length > 0) {
      const dStr = d.toISOString().slice(0, 10);
      dispatchNotification({
        companyId: req.user.companyId,
        recipientIds,
        senderId: req.user._id,
        module: 'holiday',
        eventId: 'HOLIDAY_ADDED',
        title: 'Company Holiday Announced',
        body: `${name} declared as a company holiday on ${dStr}${optional ? ' (Optional)' : ''}`,
        priority: 'low',
        deepLink: 'mirus://bdm/calendar',
        entityType: 'Holiday',
        entityId: holiday._id,
        data: { screen: 'CalendarScreen', holidayId: holiday._id }
      }).catch(() => {});
    }
  }).catch(() => {});

  res.status(201).json({ success: true, message: 'Holiday saved', holiday });
});

/** GET /api/holidays?year — the holiday calendar (any authenticated user). */
export const listHolidays = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.year) {
    const y = parseInt(req.query.year, 10);
    filter.date = { $gte: new Date(Date.UTC(y, 0, 1)), $lt: new Date(Date.UTC(y + 1, 0, 1)) };
  }
  const holidays = await Holiday.find(filter).sort({ date: 1 });
  res.status(200).json({ success: true, data: holidays });
});

/** DELETE /api/holidays/:id (HR). */
export const deleteHoliday = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid holiday id');
  const holiday = await Holiday.findByIdAndDelete(req.params.id);
  if (!holiday) throw new ApiError(404, 'Holiday not found');
  res.status(200).json({ success: true, message: 'Holiday removed' });
});
