import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Doctor from '../models/Doctor.js';
import User from '../models/User.js';
import DailyCallReport from '../models/DailyCallReport.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import {
  hasCompanyWideFieldOpsAccess,
  buildReportingSubtreeIds,
  canAccessFieldOpsUser
} from '../middleware/fieldForceAuth.js';

const DOCTOR_SELECT = 'name speciality area phone dob anniversaryDate assignedTo createdBy createdAt updatedAt';
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
 * GET /api/doctors/mine?area= — a BDM's own assigned doctors (view-only),
 * optionally filtered by area, enriched with real `lastVisitAt` (from their
 * own DailyCallReport history) — computed from actual data, never
 * fabricated. `month` is no longer accepted: MTP plans a date range + area,
 * never individual doctors (see MonthlyTourPlan model doc), so there is no
 * longer a meaningful per-doctor "planned visits this month" to compute.
 */
export const listMyDoctors = asyncHandler(async (req, res) => {
  const filter = { assignedTo: req.user._id };
  if (req.query.area) filter.area = String(req.query.area);

  const doctors = await Doctor.find(filter).select(DOCTOR_SELECT).sort({ name: 1 }).lean();
  const doctorIds = doctors.map((d) => d._id);

  const lastVisits = await DailyCallReport.aggregate([
    { $match: { userId: req.user._id, doctorId: { $in: doctorIds }, type: { $ne: 'missed' } } },
    { $group: { _id: '$doctorId', lastVisitAt: { $max: '$date' } } }
  ]);

  const lastVisitMap = new Map(lastVisits.map((v) => [String(v._id), v.lastVisitAt]));

  const data = doctors.map((d) => ({
    ...d,
    lastVisitAt: lastVisitMap.get(String(d._id)) || null
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

/** Excel date cells come through as real JS Date objects; text cells need parsing. Returns null rather than throwing on anything unparseable — dob/anniversaryDate are optional fields, never worth failing a whole row over. */
const parseExcelDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const parsed = new Date(String(v).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Parse an uploaded workbook into raw row descriptors. Shared by the
 * immediate `/import` path and the preview/confirm flow so both read the
 * spreadsheet identically.
 *
 * Recognizes both the pre-existing simple roster headers ("Name"/
 * "Speciality"/"Area"/"Assign to BDM") and the official MIRUS doctor-list
 * format ("DrName"/"Speciality/Prac"/"Location"/"Employee ID"/"Mobile No"/
 * "DOB"/"DOA") — same underlying fields, just recognizing multiple
 * spellings rather than forcing one exact header. Columns outside the
 * existing Doctor schema (Reg No, Gender, Class, VF, Marital Status,
 * Address*, City, State, PinCode, Email, Station Code, HQ/EX/OS, Manager
 * Name/Location, BDM Name, SL No.) are intentionally not read — the
 * official sheet's "Employee ID" column is the BDM's own Employee ID (used
 * to resolve and authorize the assignment server-side), never the doctor's;
 * "BDM Name" is informational only and never used to resolve the assignee,
 * since a display name is not a reliable/unique lookup key.
 */
const COLUMN_ALIASES = {
  name: 'name', doctor: 'name', drname: 'name',
  speciality: 'speciality', specialization: 'speciality', 'speciality/prac': 'speciality',
  area: 'area', territory: 'area', location: 'area',
  phone: 'phone', 'mobile no': 'phone', mobile: 'phone',
  dob: 'dob',
  doa: 'anniversaryDate',
  'assign to bdm': 'assignIdentifier', bdm: 'assignIdentifier', 'employee id': 'assignIdentifier'
};

const parseRosterRows = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The spreadsheet has no worksheets');

  const col = {};
  // The official MIRUS format's header row is row 2, not row 1 (row 1 is
  // blank) — scan the first few rows for whichever one actually contains
  // recognized headers, rather than assuming a fixed position.
  let headerRowNumber = null;
  for (let r = 1; r <= Math.min(5, sheet.rowCount); r += 1) {
    const candidate = {};
    sheet.getRow(r).eachCell((c, idx) => {
      const header = COLUMN_ALIASES[String(c.value).trim().toLowerCase()];
      if (header) candidate[header] = idx;
    });
    if (candidate.name) { Object.assign(col, candidate); headerRowNumber = r; break; }
  }
  if (!col.name) throw new ApiError(400, 'Sheet must have a "Name"/"Doctor"/"DrName" column');

  const rows = [];
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = col.name ? String(cellVal(row, col.name) || '').trim() : '';
    const speciality = col.speciality ? String(cellVal(row, col.speciality) || '').trim() : '';
    const area = col.area ? String(cellVal(row, col.area) || '').trim() : '';
    const phone = col.phone ? String(cellVal(row, col.phone) || '').trim() : '';
    const dob = col.dob ? parseExcelDate(cellVal(row, col.dob)) : null;
    const anniversaryDate = col.anniversaryDate ? parseExcelDate(cellVal(row, col.anniversaryDate)) : null;
    const assignIdentifier = col.assignIdentifier ? String(cellVal(row, col.assignIdentifier) || '').trim() : '';
    // Skip a genuinely blank row (common trailing rows at the end of a
    // sheet), but keep a row with SOME content even if name is missing —
    // that must surface as a validation error, not be silently dropped.
    if (!name && !speciality && !area && !phone && !assignIdentifier && !dob && !anniversaryDate) continue;
    rows.push({ row: r, name, speciality, area, phone, dob, anniversaryDate, assignIdentifier });
  }
  return rows;
};

/** Case-insensitive composite "same doctor" identity key: name + area (falls back to name alone when area is blank — matches the pre-existing single-column roster format). */
const doctorIdentityKey = (name, area) => `${name.trim().toLowerCase()}::${(area || '').trim().toLowerCase()}`;

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
        dob: r.dob || null, anniversaryDate: r.anniversaryDate || null,
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
 * Validate one candidate doctor row against the database and, when
 * `seenIdentities` is passed, against every row already evaluated earlier
 * in the same upload — without writing anything. Status vocabulary:
 *  - 'error'     — missing name, an "Employee ID" that doesn't resolve to a
 *                  real BDM or resolves to one outside the caller's own
 *                  reporting hierarchy, or an existing doctor match the
 *                  caller isn't authorized over. Never applied by confirm.
 *  - 'duplicate' — this row's identity (name + area, case-insensitive)
 *                  already appeared earlier in THIS SAME upload. Confirm
 *                  still applies it (the later occurrence simply updates
 *                  whatever the earlier occurrence created/matched — safe,
 *                  sequential, never a second doctor) — this status exists
 *                  purely so the reviewer sees the conflict before
 *                  confirming instead of two unexplained rows.
 *  - 'reassign'  — matches an existing doctor AND the resolved BDM differs
 *                  from that doctor's current assignment.
 *  - 'update'    — matches an existing doctor; only detail fields (or
 *                  nothing) will change, assignment is untouched.
 *  - 'ok'        — no existing match by identity; a new doctor is created.
 */
const evaluateImportRow = async (rowNumber, { name, speciality, area, phone, dob, anniversaryDate, assignIdentifier }, actor, seenIdentities) => {
  const base = { row: rowNumber, name, speciality, area, phone, dob, anniversaryDate, assignIdentifier };
  if (!name) {
    return { ...base, status: 'error', message: 'Doctor name is missing' };
  }

  let resolvedAssignedTo = null;
  if (assignIdentifier) {
    const target = assignIdentifier.includes('@')
      ? await User.findOne({ email: assignIdentifier.toLowerCase() }).select('_id')
      : await User.findOne({ 'employeeDetails.employeeId': assignIdentifier.toUpperCase() }).select('_id');
    if (!target) {
      return { ...base, status: 'error', message: `BDM Employee ID "${assignIdentifier}" not found` };
    }
    if (!(await canAccessFieldOpsUser(actor, target._id))) {
      return { ...base, status: 'error', message: `BDM "${assignIdentifier}" does not belong to your reporting hierarchy` };
    }
    resolvedAssignedTo = target._id;
  }

  // Identity = name + area (case-insensitive) when both are known; this is
  // the precise match. If that doesn't hit — e.g. the row supplies an area
  // the existing record doesn't have yet, a common "enrich the roster"
  // case — fall back to name-only, but only when the name alone already
  // identifies exactly one doctor (an ambiguous same-name-different-doctor
  // situation is deliberately left unmatched rather than guessed at; it
  // will be treated as a new doctor, same as the pre-existing behavior).
  const nameRegex = new RegExp(`^${escapeRegExp(name)}$`, 'i');
  let existing = area
    ? await Doctor.findOne({ name: nameRegex, area: new RegExp(`^${escapeRegExp(area)}$`, 'i') }).select('_id assignedTo')
    : null;
  if (!existing) {
    const nameMatches = await Doctor.find({ name: nameRegex }).select('_id assignedTo').limit(2);
    if (nameMatches.length === 1) existing = nameMatches[0];
  }

  if (existing) {
    const authorizedOverExisting = !existing.assignedTo || (await canAccessFieldOpsUser(actor, existing.assignedTo));
    if (!authorizedOverExisting) {
      return { ...base, status: 'error', message: `Doctor "${name}" already exists outside your authorization — skipped` };
    }
  }

  const resolvedAssignedToStr = resolvedAssignedTo ? String(resolvedAssignedTo) : null;
  const currentAssignedToStr = existing?.assignedTo ? String(existing.assignedTo) : null;
  const willReassign = Boolean(resolvedAssignedToStr) && resolvedAssignedToStr !== currentAssignedToStr;

  let status;
  let message;
  if (existing && willReassign) { status = 'reassign'; message = `Doctor "${name}" already exists — BDM assignment will change`; }
  else if (existing) { status = 'update'; message = `Doctor "${name}" already exists — details will be updated`; }
  else { status = 'ok'; message = 'New doctor will be created'; }

  const identityKey = doctorIdentityKey(name, area);
  const seenAtRow = seenIdentities?.get(identityKey);
  if (seenAtRow) {
    message = `Same doctor as row ${seenAtRow} in this file — ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
    status = 'duplicate';
  }

  return {
    ...base,
    resolvedAssignedTo: resolvedAssignedToStr,
    matchedDoctorId: existing ? String(existing._id) : null,
    status, message
  };
};

/**
 * POST /api/doctors/import/preview — parses and validates a roster without
 * writing anything, returning per-row status so the higher-role UI can show
 * exactly what will happen before the user confirms.
 */
export const previewImportDoctors = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "roster")');
  const rows = await parseRosterRows(req.file.buffer);

  const results = [];
  const seenIdentities = new Map();
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await evaluateImportRow(r.row, r, req.user, seenIdentities));
    if (r.name && !seenIdentities.has(doctorIdentityKey(r.name, r.area))) {
      seenIdentities.set(doctorIdentityKey(r.name, r.area), r.row);
    }
  }

  const summary = {
    total: results.length,
    new: results.filter((r) => r.status === 'ok').length,
    update: results.filter((r) => r.status === 'update').length,
    reassign: results.filter((r) => r.status === 'reassign').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
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
 *
 * Safe to retry: re-confirming the exact same rows (or re-uploading the
 * same file entirely) never creates a second doctor — identity (name+area)
 * always re-resolves to the same existing document on every subsequent
 * pass, so a repeat run only ever re-applies the same update.
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
        dob: parseExcelDate(input?.dob),
        anniversaryDate: parseExcelDate(input?.anniversaryDate),
        assignIdentifier: String(input?.assignIdentifier || '').trim()
      };
      // Re-evaluated from scratch against current DB state — a duplicate
      // row within this same confirm batch naturally resolves correctly
      // here because the loop is sequential: by the time a later row is
      // evaluated, an earlier row targeting the same doctor has already
      // been written, so this lookup finds it and updates it instead of
      // creating a second doctor.
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
        if (fields.dob) doc.dob = fields.dob;
        if (fields.anniversaryDate) doc.anniversaryDate = fields.anniversaryDate;
        if (evaluated.resolvedAssignedTo) doc.assignedTo = evaluated.resolvedAssignedTo;
        // eslint-disable-next-line no-await-in-loop
        await doc.save();
        updated.push({ row: rowNumber, name: doc.name, reassigned: Boolean(evaluated.resolvedAssignedTo) });
      } else {
        // eslint-disable-next-line no-await-in-loop
        const doc = await Doctor.create({
          name: fields.name, speciality: fields.speciality, area: fields.area, phone: fields.phone,
          dob: fields.dob, anniversaryDate: fields.anniversaryDate,
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
