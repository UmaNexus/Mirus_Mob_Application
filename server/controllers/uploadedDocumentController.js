import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import DocumentType from '../models/DocumentType.js';
import EmployeeDocumentRecord from '../models/EmployeeDocumentRecord.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fillAcroFormPdf } from '../services/pdfService.js';
import { logActivity } from '../services/activityService.js';

// ---------- DocumentType configuration (HR: doctype:manage) ----------

/** POST /api/uploaded-docs/types — define a reusable uploadable document type. */
export const createType = asyncHandler(async (req, res) => {
  const { name, section, kind, fields, termsText } = req.body;
  if (!name || !section) throw new ApiError(400, 'name and section are required');
  if (kind && !['read', 'write'].includes(kind)) throw new ApiError(400, 'kind must be "read" or "write"');
  const type = await DocumentType.create({ name, section, kind: kind || 'read', fields: fields || [], termsText });
  res.status(201).json({ success: true, message: 'Document type created', type });
});

/** GET /api/uploaded-docs/types — active types by default (hides soft-deleted). */
export const listTypes = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.all === 'true') {
    // no active filter — include soft-deleted
  } else if (req.query.active === 'false') {
    filter.active = false;
  } else {
    filter.active = true;
  }
  const types = await DocumentType.find(filter).sort({ section: 1, name: 1 });
  res.status(200).json({ success: true, data: types });
});

/** PUT /api/uploaded-docs/types/:id */
export const updateType = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid type id');
  const type = await DocumentType.findById(req.params.id);
  if (!type) throw new ApiError(404, 'Document type not found');
  ['name', 'section', 'kind', 'fields', 'termsText', 'active'].forEach((k) => {
    if (req.body[k] !== undefined) type[k] = req.body[k];
  });
  await type.save();
  res.status(200).json({ success: true, message: 'Document type updated', type });
});

/** DELETE /api/uploaded-docs/types/:id — soft-deactivate. */
export const deleteType = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid type id');
  const type = await DocumentType.findById(req.params.id);
  if (!type) throw new ApiError(404, 'Document type not found');
  type.active = false;
  await type.save();
  res.status(200).json({ success: true, message: 'Document type deactivated' });
});

// ---------- Per-employee records ----------

/**
 * POST /api/uploaded-docs — HR uploads a PDF for an employee.
 * Multipart: field "document" (PDF) + body { userId, description, documentTypeId? }.
 */
export const uploadForEmployee = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No PDF uploaded (field "document")');
  const { userId, documentTypeId } = req.body;
  const description = String(req.body.description || '').trim();
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(400, 'Valid userId is required');
  if (!description) throw new ApiError(400, 'description is required');

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Employee not found');

  let type = null;
  if (documentTypeId) {
    if (!mongoose.isValidObjectId(documentTypeId)) throw new ApiError(400, 'Valid documentTypeId is required');
    type = await DocumentType.findById(documentTypeId);
    if (!type) throw new ApiError(404, 'Document type not found');
  }

  const record = await EmployeeDocumentRecord.create({
    userId: user._id,
    documentTypeId: type?._id || null,
    description,
    section: type?.section || 'General',
    accessMode: type?.kind || 'read',
    sourceFileUrl: `uploads/documents/${req.file.filename}`,
    uploadedBy: req.user._id
  });

  const who = `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`.trim() || user.email;
  await logActivity({
    actor: req.user,
    action: 'document.upload',
    entityType: 'EmployeeDocumentRecord',
    entityId: record._id,
    message: `Document "${description}" uploaded for ${who}`
  });

  res.status(201).json({ success: true, message: 'Document uploaded and assigned', record });
});

/** GET /api/uploaded-docs/mine — caller's records, grouped by section. */
export const listMyRecords = asyncHandler(async (req, res) => {
  const records = await EmployeeDocumentRecord.find({ userId: req.user._id })
    .populate({ path: 'documentTypeId', select: 'name section kind fields termsText' })
    .sort({ section: 1, createdAt: -1 });
  res.status(200).json({ success: true, data: records });
});

/** GET /api/uploaded-docs/user/:userId — an employee's records (HR). */
export const listUserRecords = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) throw new ApiError(400, 'Invalid user id');
  const records = await EmployeeDocumentRecord.find({ userId: req.params.userId })
    .populate({ path: 'documentTypeId', select: 'name section kind' })
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: records });
});

const canAccess = (rec, req) =>
  String(rec.userId) === String(req.user._id) || ['admin', 'hr'].includes(req.user.role);

/** GET /api/uploaded-docs/:id/pdf — stream the filled (if any) or source PDF. */
export const streamRecordPdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const rec = await EmployeeDocumentRecord.findById(req.params.id);
  if (!rec) throw new ApiError(404, 'Document not found');
  if (!canAccess(rec, req)) throw new ApiError(403, 'Not permitted');

  const rel = rec.filledFileUrl || rec.sourceFileUrl;
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'PDF missing on disk');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="record-${rec._id}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});

/**
 * POST /api/uploaded-docs/:id/accept — READ mode: employee confirms they have
 * read and agree to the terms. Body: { agree: true }
 */
export const acceptRecord = asyncHandler(async (req, res) => {
  const rec = await loadOwnRecord(req);
  if (rec.accessMode !== 'read') throw new ApiError(400, 'This document requires filling, not acceptance');
  if (req.body.agree !== true) throw new ApiError(400, 'You must accept the terms to confirm');
  rec.termsAccepted = true;
  rec.status = 'acknowledged';
  rec.acknowledgedAt = new Date();
  rec.ipAddress = req.ip;
  await rec.save();
  res.status(200).json({ success: true, message: 'Document acknowledged', record: rec });
});

/**
 * POST /api/uploaded-docs/:id/fill — WRITE mode: employee submits values for the
 * PDF's existing AcroForm fields; the PDF is filled + flattened and stored.
 * Body: { fieldValues: { <fieldName>: value, ... } }
 */
export const fillRecord = asyncHandler(async (req, res) => {
  const rec = await loadOwnRecord(req);
  if (rec.accessMode !== 'write') throw new ApiError(400, 'This document is read-only (accept terms instead)');
  const values = req.body.fieldValues || {};
  if (typeof values !== 'object' || Array.isArray(values)) throw new ApiError(400, 'fieldValues must be an object');

  rec.filledFileUrl = await fillAcroFormPdf(rec.sourceFileUrl, values);
  rec.fieldValues = values;
  rec.status = 'submitted';
  rec.acknowledgedAt = new Date();
  rec.ipAddress = req.ip;
  await rec.save();
  res.status(200).json({ success: true, message: 'Document filled and saved', record: rec });
});

async function loadOwnRecord(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const rec = await EmployeeDocumentRecord.findById(req.params.id);
  if (!rec) throw new ApiError(404, 'Document not found');
  if (String(rec.userId) !== String(req.user._id)) throw new ApiError(403, 'You can only act on your own documents');
  return rec;
}
