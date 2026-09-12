import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import EmployeeDocument, { GENERATED_DOC_TYPES } from '../models/EmployeeDocument.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import OfferLetter from '../models/OfferLetter.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateCompanyDocPdf, bakeSignatureOnDoc } from '../services/pdfService.js';
import { buildAppointmentLetterPdf, appointmentFileName } from '../services/appointmentLetterService.js';

const fullName = (u) => `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim();

// Document templates. `requiresSignature` decides acknowledge-checkbox vs counter-sign.
const TEMPLATES = {
  AppointmentLetter: {
    title: 'APPOINTMENT LETTER',
    requiresSignature: true,
    paragraphs: (ctx) => [
      `We are pleased to confirm your appointment as ${ctx.designation || 'an employee'} with effect from ${new Date(ctx.effectiveDate).toDateString()}.`
    ]
  },
  NDA: {
    title: 'Non-Disclosure & Confidentiality Agreement',
    requiresSignature: true,
    paragraphs: (ctx) => [
      `This Agreement is entered into between ${ctx.companyName} and ${ctx.employeeName} effective ${new Date(ctx.effectiveDate).toDateString()}.`,
      `You agree to hold in strict confidence all proprietary and confidential information of the company and not to disclose it to any third party during or after your employment.`,
      `Breach of this agreement may result in disciplinary and legal action. Please sign below to confirm your agreement.`
    ]
  },
  Handbook: {
    title: 'Employee Handbook Acknowledgment',
    requiresSignature: false,
    paragraphs: (ctx) => [
      `I, ${ctx.employeeName}, acknowledge that I have received and read the employee handbook of ${ctx.companyName}.`,
      `I understand the policies and agree to comply with them throughout my employment.`
    ]
  },
  CodeOfConduct: {
    title: 'Code of Conduct Acceptance',
    requiresSignature: false,
    paragraphs: (ctx) => [
      `I, ${ctx.employeeName}, have read and understood the Code of Conduct of ${ctx.companyName}.`,
      `I agree to uphold the standards of professional and ethical behavior it describes.`
    ]
  }
};

/**
 * POST /api/employee-docs — issue a generated, company-sealed document to an
 * employee (Epic 10). Body: { userId, type, effectiveDate?, designation?, ...inputs }
 */
export const issueDocument = asyncHandler(async (req, res) => {
  const { userId, type, effectiveDate, designation, location, reportingArea } = req.body;
  if (!GENERATED_DOC_TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${GENERATED_DOC_TYPES.join(', ')}`);
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, 'Valid userId is required');

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Employee not found');
  const company = await Company.findById(req.user.companyId);

  const tpl = TEMPLATES[type];
  const ctx = {
    companyName: company?.name || 'Company',
    employeeName: fullName(user),
    designation: designation || user.employeeDetails?.designation,
    effectiveDate: effectiveDate || Date.now()
  };

  let pdfFileUrl;
  let title = tpl.title;
  let requiresSignature = tpl.requiresSignature;
  let downloadFileName = null;

  if (type === 'AppointmentLetter') {
    const reporting = String(location || reportingArea || user.employeeDetails?.workLocation || '').trim();
    const offer = await OfferLetter.findOne({
      candidateEmail: user.email,
      companyId: user.companyId
    }).sort({ offerDate: -1, createdAt: -1 }).select('phone city location');
    const built = await buildAppointmentLetterPdf({
      user,
      company,
      designation: ctx.designation,
      effectiveDate: ctx.effectiveDate,
      department: user.employeeDetails?.department,
      location: reporting || offer?.location || '',
      offerPhone: offer?.phone || '',
      offerAddress: offer?.city || ''
    });
    pdfFileUrl = built.pdfFileUrl;
    title = built.title;
    downloadFileName = built.fileName;
  } else {
    pdfFileUrl = await generateCompanyDocPdf({
      title: tpl.title,
      paragraphs: tpl.paragraphs(ctx),
      company,
      employeeName: ctx.employeeName,
      designation: ctx.designation,
      effectiveDate: ctx.effectiveDate
    });
  }

  const doc = await EmployeeDocument.create({
    userId: user._id,
    type,
    title,
    inputs: {
      effectiveDate: ctx.effectiveDate,
      designation: ctx.designation,
      ...(downloadFileName ? { downloadFileName } : {})
    },
    pdfFileUrl,
    requiresSignature,
    issuedBy: req.user._id
  });

  res.status(201).json({ success: true, message: `${title} issued`, document: doc });
});

/** GET /api/employee-docs/mine — the caller's issued documents. */
export const listMyDocuments = asyncHandler(async (req, res) => {
  const docs = await EmployeeDocument.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: docs });
});

/** GET /api/employee-docs/user/:userId — an employee's issued documents (HR). */
export const listUserDocuments = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) throw new ApiError(400, 'Invalid user id');
  const docs = await EmployeeDocument.find({ userId: req.params.userId }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: docs });
});

const canAccess = (doc, req) =>
  String(doc.userId) === String(req.user._id) || ['admin', 'hr'].includes(req.user.role);

/** GET /api/employee-docs/:id/pdf — stream the (acknowledged, if available) PDF. */
export const streamDocumentPdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const doc = await EmployeeDocument.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Document not found');
  if (!canAccess(doc, req)) throw new ApiError(403, 'Not permitted to access this document');

  const rel = doc.acknowledgedPdfFileUrl || doc.pdfFileUrl;
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'PDF missing on disk');
  let fileName = `doc-${doc._id}.pdf`;
  if (doc.type === 'AppointmentLetter') {
    if (doc.inputs?.downloadFileName) {
      fileName = doc.inputs.downloadFileName;
    } else {
      const owner = await User.findById(doc.userId).select('personalDetails');
      fileName = appointmentFileName(fullName(owner) || fullName(req.user));
    }
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${String(fileName).replace(/"/g, '')}"`);
  fs.createReadStream(abs).pipe(res);
});

/**
 * POST /api/employee-docs/:id/acknowledge — employee accepts / counter-signs
 * their own document. Body: { agree: true, signatureBase64? }
 */
export const acknowledgeDocument = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const doc = await EmployeeDocument.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Document not found');
  if (String(doc.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only acknowledge your own documents');
  if (doc.status === 'acknowledged') throw new ApiError(409, 'Already acknowledged');

  const signedAt = new Date();
  if (doc.requiresSignature) {
    if (!req.body.signatureBase64) throw new ApiError(400, 'A signature is required for this document');
    doc.acknowledgedPdfFileUrl = await bakeSignatureOnDoc(doc.pdfFileUrl, req.body.signatureBase64, { name: fullName(req.user), signedAt });
    doc.signature = { signatureBase64: req.body.signatureBase64, signedAt, ipAddress: req.ip };
  } else {
    if (req.body.agree !== true) throw new ApiError(400, 'You must agree to acknowledge this document');
  }
  doc.status = 'acknowledged';
  doc.acknowledgedAt = signedAt;
  await doc.save();

  res.status(200).json({ success: true, message: 'Document acknowledged', document: doc });
});
