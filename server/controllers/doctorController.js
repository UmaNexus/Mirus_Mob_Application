import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Doctor from '../models/Doctor.js';
import User from '../models/User.js';
import DailyCallReport from '../models/DailyCallReport.js';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import {
  hasCompanyWideFieldOpsAccess,
  buildReportingSubtreeIds,
  canAccessFieldOpsUser
} from '../middleware/fieldForceAuth.js';

const DOCTOR_SELECT = 'name speciality area phone dob anniversaryDate assignedTo createdBy createdAt updatedAt';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve the set of `assignedTo` values the caller may see/manage:
 *  - company-wide access (admin/superadmin): null => no extra restriction.
 *  - a tiered manager (ASM+): their reporting subtree plus the unassigned
 *    pool (doctors nobody owns yet are a shared pool within the tenant).
 */
const allowedAssigneeFilter = async (actor) => {
  if (hasCompanyWideFieldOpsAccess(actor)) return null;
  const subtree = await buildReportingSubtreeIds(actor._id);
  return { $in: [...subtree, null] };
};

/**
 * GET /api/doctors/mine?area=&month=YYYY-MM — a BDM's own assigned doctors
 * (view-only), optionally filtered by area (their own MTP area-first planning
 * flow) and enriched with real `lastVisitAt` (from their own DailyCallReport
 * history) and `plannedVisitsThisMonth` (from their own MTP for that month)
 * — both computed from actual data, never fabricated.
 */
export const listMyDoctors = asyncHandler(async (req, res) => {
  const filter = { assignedTo: req.user._id };
  if (req.query.area) filter.area = String(req.query.area);

  const doctors = await Doctor.find(filter).select(DOCTOR_SELECT).sort({ name: 1 }).lean();
  const doctorIds = doctors.map((d) => d._id);

  const month = req.query.month && MONTH_RE.test(req.query.month) ? String(req.query.month) : null;
  const [lastVisits, monthPlans] = await Promise.all([
    DailyCallReport.aggregate([
      { $match: { userId: req.user._id, doctorId: { $in: doctorIds }, type: { $ne: 'missed' } } },
      { $group: { _id: '$doctorId', lastVisitAt: { $max: '$date' } } }
    ]),
    // A BDM may hold several independent tour plans within the same month —
    // sum planned visits across ALL of them, never just one.
    month ? MonthlyTourPlan.find({ userId: req.user._id, month }).select('plannedVisits').lean() : []
  ]);

  const lastVisitMap = new Map(lastVisits.map((v) => [String(v._id), v.lastVisitAt]));
  const plannedCountMap = new Map();
  for (const plan of monthPlans) {
    for (const visit of plan.plannedVisits || []) {
      const key = String(visit.doctorId);
      plannedCountMap.set(key, (plannedCountMap.get(key) || 0) + 1);
    }
  }

  const data = doctors.map((d) => ({
    ...d,
    lastVisitAt: lastVisitMap.get(String(d._id)) || null,
    plannedVisitsThisMonth: plannedCountMap.get(String(d._id)) || 0
  }));
  res.status(200).json({ success: true, data });
});

/**
 * GET /api/doctors/alerts — upcoming birthdays/anniversaries (next 7 days,
 * month/day compared regardless of year) for the caller's own assigned doctors.
 */
export const listDoctorAlerts = asyncHandler(async (req, res) => {
  const doctors = await Doctor.find({
    assignedTo: req.user._id,
    $or: [{ dob: { $ne: null } }, { anniversaryDate: { $ne: null } }]
  }).select('name speciality area dob anniversaryDate');

  const today = new Date();
  const withinWindow = (date, days = 7) => {
    if (!date) return false;
    const d = new Date(date);
    const next = new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    let diff = Math.round((next - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000);
    if (diff < 0) diff += 365; // wrapped into next year
    return diff >= 0 && diff <= days;
  };

  const alerts = [];
  for (const doc of doctors) {
    if (withinWindow(doc.dob)) alerts.push({ doctorId: doc._id, name: doc.name, type: 'birthday', date: doc.dob });
    if (withinWindow(doc.anniversaryDate)) alerts.push({ doctorId: doc._id, name: doc.name, type: 'anniversary', date: doc.anniversaryDate });
  }
  res.status(200).json({ success: true, data: alerts });
});

/** GET /api/doctors — ASM+ management view, scoped to reporting subtree + unassigned pool. */
export const listDoctors = asyncHandler(async (req, res) => {
  const filter = {};
  const scope = await allowedAssigneeFilter(req.user);
  if (scope) filter.assignedTo = scope;

  if (req.query.unassigned === 'true') {
    filter.assignedTo = null;
  } else if (req.query.assignedTo) {
    if (!mongoose.isValidObjectId(req.query.assignedTo)) throw new ApiError(400, 'Invalid assignedTo id');
    if (!(await canAccessFieldOpsUser(req.user, req.query.assignedTo))) {
      throw new ApiError(403, 'You are not authorized to view this BDM\'s doctors');
    }
    filter.assignedTo = req.query.assignedTo;
  }
  if (req.query.search) {
    filter.$text = { $search: String(req.query.search) };
  }

  const doctors = await Doctor.find(filter).select(DOCTOR_SELECT).sort({ name: 1 }).limit(1000);
  res.status(200).json({ success: true, data: doctors });
});

/** POST /api/doctors — ASM+ creates a doctor, optionally assigning it to a BDM in their scope. */
export const createDoctor = asyncHandler(async (req, res) => {
  const { name, speciality, area, phone, dob, anniversaryDate, assignedTo } = req.body;

  if (assignedTo) {
    const target = await User.findById(assignedTo).select('_id');
    if (!target) throw new ApiError(400, 'assignedTo user not found');
    if (!(await canAccessFieldOpsUser(req.user, assignedTo))) {
      throw new ApiError(403, 'You are not authorized to assign a doctor to this user');
    }
  }

  const doctor = await Doctor.create({
    name, speciality, area, phone,
    dob: dob || null,
    anniversaryDate: anniversaryDate || null,
    assignedTo: assignedTo || null,
    createdBy: req.user._id
  });

  await logActivity({
    actor: req.user, action: 'doctor.create', entityType: 'Doctor', entityId: doctor._id,
    message: `Doctor "${doctor.name}" created${assignedTo ? ' and assigned' : ''}`
  });

  res.status(201).json({ success: true, message: 'Doctor created', doctor });
});

/** PATCH /api/doctors/:id — ASM+ edits/reassigns a doctor within their scope. */
export const updateDoctor = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid doctor id');
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  // Authorize against the doctor's CURRENT assignment (unassigned = shared pool).
  if (doctor.assignedTo && !(await canAccessFieldOpsUser(req.user, doctor.assignedTo))) {
    throw new ApiError(403, 'You are not authorized to manage this doctor');
  }

  const { name, speciality, area, phone, dob, anniversaryDate, assignedTo } = req.body;
  const previousAssignee = doctor.assignedTo ? String(doctor.assignedTo) : null;

  if (assignedTo !== undefined) {
    if (assignedTo) {
      const target = await User.findById(assignedTo).select('_id');
      if (!target) throw new ApiError(400, 'assignedTo user not found');
      if (!(await canAccessFieldOpsUser(req.user, assignedTo))) {
        throw new ApiError(403, 'You are not authorized to assign a doctor to this user');
      }
    }
    doctor.assignedTo = assignedTo || null;
  }
  if (name !== undefined) doctor.name = name;
  if (speciality !== undefined) doctor.speciality = speciality;
  if (area !== undefined) doctor.area = area;
  if (phone !== undefined) doctor.phone = phone;
  if (dob !== undefined) doctor.dob = dob || null;
  if (anniversaryDate !== undefined) doctor.anniversaryDate = anniversaryDate || null;

  await doctor.save();

  const newAssignee = doctor.assignedTo ? String(doctor.assignedTo) : null;
  if (newAssignee !== previousAssignee) {
    await logActivity({
      actor: req.user, action: 'doctor.reassign', entityType: 'Doctor', entityId: doctor._id,
      message: `Doctor "${doctor.name}" reassigned`,
      meta: { from: previousAssignee, to: newAssignee }
    });
  }

  res.status(200).json({ success: true, message: 'Doctor updated', doctor });
});

// ---------- CSV/XLSX import ----------

const cellVal = (row, idx) => {
  if (!idx) return null;
  const v = row.getCell(idx).value;
  if (v && typeof v === 'object' && 'text' in v) return v.text;
  if (v && typeof v === 'object' && 'result' in v) return v.result;
  return v;
};

/**
 * Parse an uploaded workbook into raw row descriptors. Sheet columns: Name,
 * Speciality, Area, Phone, Assign to BDM (Employee ID or email). Shared by
 * the immediate `/import` path and the preview/confirm flow so both read the
 * spreadsheet identically.
 */
// Accepts the pre-existing header names ("Name"/"Speciality"/"Assign to
// BDM") and the business's own example roster headers ("Doctor"/
// "Specialization"/"BDM") interchangeably — same underlying fields, just
// recognizing both spellings rather than forcing one exact header.
const COLUMN_ALIASES = {
  name: 'name', doctor: 'name',
  speciality: 'speciality', specialization: 'speciality',
  area: 'area', territory: 'area',
  phone: 'phone',
  'assign to bdm': 'assignIdentifier', bdm: 'assignIdentifier'
};

const parseRosterRows = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The spreadsheet has no worksheets');

  const col = {};
  sheet.getRow(1).eachCell((c, idx) => {
    const header = COLUMN_ALIASES[String(c.value).trim().toLowerCase()];
    if (header) col[header] = idx;
  });
  if (!col.name) throw new ApiError(400, 'Sheet must have a "Name"/"Doctor" column');

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = col.name ? String(cellVal(row, col.name) || '').trim() : '';
    const speciality = col.speciality ? String(cellVal(row, col.speciality) || '').trim() : '';
    const area = col.area ? String(cellVal(row, col.area) || '').trim() : '';
    const phone = col.phone ? String(cellVal(row, col.phone) || '').trim() : '';
    const assignIdentifier = col.assignIdentifier ? String(cellVal(row, col.assignIdentifier) || '').trim() : '';
    // Skip a genuinely blank row (common trailing rows at the end of a
    // sheet), but keep a row with SOME content even if name is missing —
    // that must surface as a validation error, not be silently dropped.
    if (!name && !speciality && !area && !phone && !assignIdentifier) continue;
    rows.push({ row: r, name, speciality, area, phone, assignIdentifier });
  }
  return rows;
};

/**
 * POST /api/doctors/import — bulk import, immediate insert (no preview
 * stage). Each row is authorized exactly like a single createDoctor call — a
 * row assigning to a BDM outside the caller's scope fails that row only
 * (reported in `failed[]`), it does not abort the whole import. Kept for
 * existing callers; the mobile bulk-assignment UI uses the preview/confirm
 * pair below instead.
 */
export const importDoctors = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "roster")');
  const rows = await parseRosterRows(req.file.buffer);

  const imported = [];
  const failed = [];

  for (const r of rows) {
    try {
      if (!r.name) throw new Error('Doctor name is missing');
      let assignedTo = null;
      if (r.assignIdentifier) {
        const target = r.assignIdentifier.includes('@')
          ? await User.findOne({ email: r.assignIdentifier.toLowerCase() }).select('_id')
          : await User.findOne({ 'employeeDetails.employeeId': r.assignIdentifier.toUpperCase() }).select('_id');
        if (!target) throw new Error(`Assignee not found (${r.assignIdentifier})`);
        if (!(await canAccessFieldOpsUser(req.user, target._id))) {
          throw new Error(`Not authorized to assign to ${r.assignIdentifier}`);
        }
        assignedTo = target._id;
      }

      const doctor = await Doctor.create({
        name: r.name, speciality: r.speciality, area: r.area, phone: r.phone,
        assignedTo, createdBy: req.user._id
      });
      imported.push({ row: r.row, name: doctor.name });
    } catch (err) {
      failed.push({ row: r.row, name: r.name, error: err.message });
    }
  }

  await logActivity({
    actor: req.user, action: 'doctor.import', entityType: 'Doctor', entityId: '',
    message: `Imported ${imported.length} doctor(s), ${failed.length} failed`
  });

  res.status(201).json({ success: true, message: `Imported ${imported.length}, failed ${failed.length}`, imported, failed });
});

/**
 * Validate one candidate doctor row against the database, without writing
 * anything:
 *  - missing name -> error
 *  - "Assign to BDM" identifier that doesn't resolve, or resolves outside the
 *    caller's own reporting subtree -> error (never silently assigns)
 *  - an existing doctor with the same name (case-insensitive) that the caller
 *    IS authorized over -> warning (will update, not duplicate)
 *  - an existing doctor with the same name that the caller is NOT authorized
 *    over -> error (never silently overwritten)
 */
const evaluateImportRow = async (rowNumber, { name, speciality, area, phone, assignIdentifier }, actor) => {
  if (!name) {
    return { row: rowNumber, name, speciality, area, phone, assignIdentifier, status: 'error', message: 'Doctor name is missing' };
  }

  let resolvedAssignedTo = null;
  if (assignIdentifier) {
    const target = assignIdentifier.includes('@')
      ? await User.findOne({ email: assignIdentifier.toLowerCase() }).select('_id')
      : await User.findOne({ 'employeeDetails.employeeId': assignIdentifier.toUpperCase() }).select('_id');
    if (!target) {
      return { row: rowNumber, name, speciality, area, phone, assignIdentifier, status: 'error', message: `BDM "${assignIdentifier}" not found` };
    }
    if (!(await canAccessFieldOpsUser(actor, target._id))) {
      return { row: rowNumber, name, speciality, area, phone, assignIdentifier, status: 'error', message: `BDM "${assignIdentifier}" does not belong to your reporting hierarchy` };
    }
    resolvedAssignedTo = target._id;
  }

  const existing = await Doctor.findOne({ name: new RegExp(`^${escapeRegExp(name)}$`, 'i') }).select('_id assignedTo');
  if (existing) {
    const authorizedOverExisting = !existing.assignedTo || (await canAccessFieldOpsUser(actor, existing.assignedTo));
    if (!authorizedOverExisting) {
      return { row: rowNumber, name, speciality, area, phone, assignIdentifier, status: 'error', message: `Doctor "${name}" already exists outside your authorization — skipped` };
    }
    return {
      row: rowNumber, name, speciality, area, phone, assignIdentifier,
      resolvedAssignedTo: resolvedAssignedTo ? String(resolvedAssignedTo) : null,
      matchedDoctorId: String(existing._id),
      status: 'warning', message: 'Doctor already exists — will update assignment'
    };
  }

  return {
    row: rowNumber, name, speciality, area, phone, assignIdentifier,
    resolvedAssignedTo: resolvedAssignedTo ? String(resolvedAssignedTo) : null,
    matchedDoctorId: null,
    status: 'ok', message: 'New doctor will be created'
  };
};

/**
 * POST /api/doctors/import/preview — parses and validates a roster without
 * writing anything, returning per-row status so the mobile UI can show the
 * user exactly what will happen before they confirm.
 */
export const previewImportDoctors = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "roster")');
  const rows = await parseRosterRows(req.file.buffer);

  const results = [];
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await evaluateImportRow(r.row, r, req.user));
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    warning: results.filter((r) => r.status === 'warning').length,
    error: results.filter((r) => r.status === 'error').length
  };
  res.status(200).json({ success: true, summary, rows: results });
});

/**
 * POST /api/doctors/import/confirm — commits a previously previewed roster.
 * Every row is re-validated from scratch here (never trusting the
 * client-supplied `resolvedAssignedTo`/`matchedDoctorId` from the preview
 * response, since authorization/state could have changed since then) before
 * creating or updating. Non-destructive: matched rows update the existing
 * doctor's assignment/details, nothing is ever deleted.
 */
export const confirmImportDoctors = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) throw new ApiError(400, 'No rows to import');

  const created = [];
  const updated = [];
  const failed = [];

  for (const input of rows) {
    const rowNumber = input?.row;
    try {
      const name = String(input?.name || '').trim();
      const fields = {
        name,
        speciality: String(input?.speciality || '').trim(),
        area: String(input?.area || '').trim(),
        phone: String(input?.phone || '').trim(),
        assignIdentifier: String(input?.assignIdentifier || '').trim()
      };
      // eslint-disable-next-line no-await-in-loop
      const evaluated = await evaluateImportRow(rowNumber, fields, req.user);
      if (evaluated.status === 'error') throw new Error(evaluated.message);

      if (evaluated.matchedDoctorId) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await Doctor.findById(evaluated.matchedDoctorId);
        if (!doc) throw new Error('Matched doctor no longer exists');
        // eslint-disable-next-line no-await-in-loop
        if (doc.assignedTo && !(await canAccessFieldOpsUser(req.user, doc.assignedTo))) {
          throw new Error('No longer authorized to modify this doctor');
        }
        if (fields.speciality) doc.speciality = fields.speciality;
        if (fields.area) doc.area = fields.area;
        if (fields.phone) doc.phone = fields.phone;
        if (evaluated.resolvedAssignedTo) doc.assignedTo = evaluated.resolvedAssignedTo;
        // eslint-disable-next-line no-await-in-loop
        await doc.save();
        updated.push({ row: rowNumber, name: doc.name });
      } else {
        // eslint-disable-next-line no-await-in-loop
        const doc = await Doctor.create({
          name: fields.name, speciality: fields.speciality, area: fields.area, phone: fields.phone,
          assignedTo: evaluated.resolvedAssignedTo || null, createdBy: req.user._id
        });
        created.push({ row: rowNumber, name: doc.name });
      }
    } catch (err) {
      failed.push({ row: rowNumber, name: input?.name, error: err.message });
    }
  }

  await logActivity({
    actor: req.user, action: 'doctor.import', entityType: 'Doctor', entityId: '',
    message: `Bulk import confirmed: ${created.length} created, ${updated.length} updated, ${failed.length} failed`
  });

  res.status(201).json({
    success: true,
    message: `${created.length} created, ${updated.length} updated, ${failed.length} failed`,
    created, updated, failed
  });
});
