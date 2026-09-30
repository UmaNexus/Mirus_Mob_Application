import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import ExitRecord from '../models/ExitRecord.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateCompanyDocPdf, formatOfferDate } from '../services/pdfService.js';
import fnfService from '../services/fnfService.js';
import { logActivity } from '../services/activityService.js';

const fullName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim();

/** POST /api/exits — initiate offboarding for an employee. */
export const initiateExit = asyncHandler(async (req, res) => {
  const { userId, resignationDate, lastWorkingDay, reason } = req.body;
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, 'Valid userId is required');
  if (!resignationDate || !lastWorkingDay) throw new ApiError(400, 'resignationDate and lastWorkingDay are required');
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Employee not found');

  const existing = await ExitRecord.findOne({ userId, status: { $in: ['Initiated', 'InProgress'] } });
  if (existing) throw new ApiError(400, 'An exit has already been initiated for this employee');

  const record = await ExitRecord.create({ userId, resignationDate, lastWorkingDay, reason, status: 'Initiated' });
  await record.populate('userId', 'email personalDetails.firstName personalDetails.lastName employeeDetails.employeeId');
  await logActivity({
    actor: req.user,
    action: 'exit.initiate',
    entityType: 'ExitRecord',
    entityId: record._id,
    message: `Exit initiated for ${fullName(user) || user.email}`
  });
  res.status(201).json({ success: true, message: 'Exit initiated', record });
});

/** GET /api/exits?status */
export const listExits = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const data = await ExitRecord.find(filter)
    .populate('userId', 'email personalDetails.firstName personalDetails.lastName employeeDetails.employeeId')
    .sort({ createdAt: -1 })
    .limit(500);
  res.status(200).json({ success: true, data });
});

/** GET /api/exits/:id */
export const getExit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id)
    .populate('userId', 'email personalDetails.firstName personalDetails.lastName employeeDetails.employeeId');
  if (!record) throw new ApiError(404, 'Exit record not found');
  res.status(200).json({ success: true, record });
});

/** PATCH /api/exits/:id — update interview, F&F, asset-return checklist, status. */
export const updateExit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Exit record not found');

  if (req.body.exitInterview) {
    record.exitInterview = {
      conductedAt: req.body.exitInterview.conductedAt || record.exitInterview.conductedAt,
      notes: req.body.exitInterview.notes ?? record.exitInterview.notes,
      conductedById: req.body.exitInterview.conductedById || req.user._id
    };
  }
  if (Array.isArray(req.body.assetReturnChecklist)) record.assetReturnChecklist = req.body.assetReturnChecklist;
  if (req.body.fnfSettlement) {
    Object.assign(record.fnfSettlement, req.body.fnfSettlement);
    if (req.body.fnfSettlement.status === 'Settled' && !record.fnfSettlement.settledAt) record.fnfSettlement.settledAt = new Date();
  }
  if (req.body.status && ['Initiated', 'InProgress', 'Completed'].includes(req.body.status)) record.status = req.body.status;
  await record.save();
  res.status(200).json({ success: true, message: 'Exit record updated', record });
});

/**
 * POST /api/exits/:id/letters — generate the sealed relieving + experience
 * letters for the employee (Epic 14, reuses the company-doc generator).
 */
export const generateExitLetters = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Exit record not found');
  const user = await User.findById(record.userId);
  if (!user) throw new ApiError(404, 'Employee not found');
  const company = await Company.findById(req.user.companyId);
  const previewOnly = req.body?.previewOnly === true || req.body?.previewOnly === 'true';

  const fnfFields = req.body?.fnfFields && typeof req.body.fnfFields === 'object' ? req.body.fnfFields : {};
  const name = fullName(user);
  const designation = user.employeeDetails?.designation || 'Employee';
  const doj = user.employeeDetails?.dateOfJoining ? formatOfferDate(user.employeeDetails.dateOfJoining) : 'the date of joining';
  const companyName = company?.name || 'the Company';

  const safeReason = String(fnfFields.reason || record.reason || 'Resignation').trim();
  const safeLastWorkingDay = fnfFields.lastWorkingDay || record.lastWorkingDay;
  const rawAmount = fnfFields.amount ?? record.fnfSettlement?.amount ?? 0;
  const safeAmount = rawAmount != null && rawAmount !== ''
    ? (fnfFields.amount !== undefined && fnfFields.amount !== null && fnfFields.amount !== ''
      ? Math.round(Number(String(fnfFields.amount).replace(/[₹,\s]/g, '')) * 100)
      : Number(rawAmount) || 0)
    : 0;

  if (safeLastWorkingDay && !Number.isNaN(new Date(safeLastWorkingDay).getTime())) {
    record.lastWorkingDay = new Date(safeLastWorkingDay);
  }
  if (safeAmount != null && safeAmount !== '') {
    record.fnfSettlement.amount = safeAmount;
  }
  record.reason = safeReason;
  if (safeLastWorkingDay) record.lastWorkingDay = new Date(safeLastWorkingDay);

  record.relievingLetterUrl = await generateCompanyDocPdf({
    title: 'Relieving Letter', company, employeeName: name, designation, effectiveDate: record.lastWorkingDay,
    paragraphs: [
      `This is to certify that ${name} (${designation}) has been relieved from the services of ${companyName} with effect from the close of business on ${formatOfferDate(record.lastWorkingDay)}.`,
      `We confirm that all dues have been settled as per company policy. We wish ${name} success in future endeavours.`
    ]
  });
  record.experienceLetterUrl = await generateCompanyDocPdf({
    title: 'Experience Letter', company, employeeName: name, designation, effectiveDate: record.lastWorkingDay,
    paragraphs: [
      `This is to certify that ${name} was employed with ${companyName} as ${designation} from ${doj} to ${formatOfferDate(record.lastWorkingDay)}.`,
      `During the tenure, their conduct and performance were found to be satisfactory.`
    ]
  });

  let previewLetterUrl = null;
  try {
    const fnfPdf = await fnfService.generateAndEmailFNF({
      record,
      user,
      company,
      actor: req.user,
      fnfFields: {
        amount: safeAmount,
        reason: safeReason,
        lastWorkingDay: safeLastWorkingDay
      },
      previewOnly
    });
    if (fnfPdf) {
      if (previewOnly) {
        previewLetterUrl = fnfPdf;
      } else {
        record.fnfLetterUrl = fnfPdf;
      }
    }
  } catch (err) {
    await logActivity({ actor: req.user, action: 'exit.fnf_failed', entityType: 'ExitRecord', entityId: record._id, message: `FNF generation/email failed for ${name}: ${err.message}` });
  }

  await record.save();
  await logActivity({
    actor: req.user,
    action: previewOnly ? 'exit.fnf_preview' : 'exit.letters',
    entityType: 'ExitRecord',
    entityId: record._id,
    message: previewOnly ? `FNF preview generated for ${name}` : `Exit letters generated for ${name}`
  });

  res.status(200).json({
    success: true,
    message: previewOnly ? 'FNF preview generated' : 'Relieving and experience letters generated',
    relievingLetterUrl: record.relievingLetterUrl,
    experienceLetterUrl: record.experienceLetterUrl,
    fnfLetterUrl: record.fnfLetterUrl,
    previewLetterUrl
  });
});

/**
 * GET /api/exits/:id/fnf — stream/download FNF letter.
 * Generates the letter on demand if not yet generated.
 */
export const downloadFNFLetter = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid exit id');

  const record = await ExitRecord.findById(id);
  if (!record) throw new ApiError(404, 'Exit record not found');
  const user = await User.findById(record.userId);
  if (!user) throw new ApiError(404, 'Employee not found');
  const company = await Company.findById(req.user.companyId || user.companyId);

  const name = fullName(user) || 'Employee';
  const safeName = (name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Employee').trim();
  const downloadFileName = `${safeName}_FNF_Settlement.pdf`;

  // Always re-generate FNF PDF on download to reflect latest template, branding, and fixes
  const fnfPdf = await fnfService.generateFNFPdf({ record, user, company });
  if (fnfPdf) {
    record.fnfLetterUrl = fnfPdf;
    await record.save();
  }

  if (!record.fnfLetterUrl) {
    throw new ApiError(404, 'No active FNF letter template found. Please configure one under Letter Templates.');
  }

  const abs = path.resolve(process.cwd(), record.fnfLetterUrl);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'FNF PDF file missing on disk');

  const disposition = req.query.download === 'false' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${downloadFileName}"`);
  fs.createReadStream(abs).pipe(res);
});


/** DELETE /api/exits/:id — only when Initiated and no letters issued. */
export const deleteExit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const record = await ExitRecord.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Exit record not found');
  if (record.status === 'Completed') {
    throw new ApiError(400, 'Completed exits cannot be deleted');
  }
  // Allow removing exit records even after letters have been generated.
  const user = await User.findById(record.userId).select('personalDetails email');
  await record.deleteOne();
  await logActivity({
    actor: req.user,
    action: 'exit.delete',
    entityType: 'ExitRecord',
    entityId: req.params.id,
    message: `Exit record deleted for ${user ? fullName(user) || user.email : 'employee'}`
  });
  res.status(200).json({ success: true, message: 'Exit record deleted' });
});
