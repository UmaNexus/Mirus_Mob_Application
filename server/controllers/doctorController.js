import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Doctor from '../models/Doctor.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import {
  hasCompanyWideFieldOpsAccess,
  buildReportingSubtreeIds,
  canAccessFieldOpsUser
} from '../middleware/fieldForceAuth.js';

const DOCTOR_SELECT = 'name speciality area phone dob anniversaryDate assignedTo createdBy createdAt updatedAt';

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

/** GET /api/doctors/mine — a BDM's own assigned doctors (view-only). */
export const listMyDoctors = asyncHandler(async (req, res) => {
  const doctors = await Doctor.find({ assignedTo: req.user._id }).select(DOCTOR_SELECT).sort({ name: 1 });
  res.status(200).json({ success: true, data: doctors });
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
 * POST /api/doctors/import — bulk import. Sheet columns: Name, Speciality,
 * Area, Phone, Assign to BDM (Employee ID or email). Each row is authorized
 * exactly like a single createDoctor call — a row assigning to a BDM outside
 * the caller's scope fails that row only (reported in `failed[]`), it does
 * not abort the whole import.
 */
export const importDoctors = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "roster")');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The spreadsheet has no worksheets');

  const col = {};
  sheet.getRow(1).eachCell((c, idx) => { col[String(c.value).trim().toLowerCase()] = idx; });
  if (!col.name) throw new ApiError(400, 'Sheet must have a "Name" column');

  const imported = [];
  const failed = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = col.name ? cellVal(row, col.name) : null;
    if (!name) continue;

    try {
      const assignIdentifier = col['assign to bdm'] ? String(cellVal(row, col['assign to bdm']) || '').trim() : '';
      let assignedTo = null;
      if (assignIdentifier) {
        const target = assignIdentifier.includes('@')
          ? await User.findOne({ email: assignIdentifier.toLowerCase() }).select('_id')
          : await User.findOne({ 'employeeDetails.employeeId': assignIdentifier.toUpperCase() }).select('_id');
        if (!target) throw new Error(`Assignee not found (${assignIdentifier})`);
        if (!(await canAccessFieldOpsUser(req.user, target._id))) {
          throw new Error(`Not authorized to assign to ${assignIdentifier}`);
        }
        assignedTo = target._id;
      }

      const doctor = await Doctor.create({
        name: String(name).trim(),
        speciality: col.speciality ? String(cellVal(row, col.speciality) || '').trim() : '',
        area: col.area ? String(cellVal(row, col.area) || '').trim() : '',
        phone: col.phone ? String(cellVal(row, col.phone) || '').trim() : '',
        assignedTo,
        createdBy: req.user._id
      });
      imported.push({ row: r, name: doctor.name });
    } catch (err) {
      failed.push({ row: r, name, error: err.message });
    }
  }

  await logActivity({
    actor: req.user, action: 'doctor.import', entityType: 'Doctor', entityId: '',
    message: `Imported ${imported.length} doctor(s), ${failed.length} failed`
  });

  res.status(201).json({ success: true, message: `Imported ${imported.length}, failed ${failed.length}`, imported, failed });
});
