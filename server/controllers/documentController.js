import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import mongoose from 'mongoose';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { documentRelPath } from '../middleware/uploadDocument.js';
import { logActivity } from '../services/activityService.js';

// Validate the :fileId path param is a plain UUID (defends against traversal).
const isFileId = (id) => /^[0-9a-fA-F-]{36}$/.test(id);

/**
 * POST /api/documents — US 6.2
 * Upload a PDF (multer-validated) into the caller's vault.
 * Body: { documentType, documentNumber }
 */
export const uploadUserDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No document uploaded (field "document")');
  const { documentType, documentName, documentNumber } = req.body;

  const fileId = path.basename(req.file.filename, '.pdf');
  const docRef = {
    documentType,
    documentName,
    documentNumber,
    fileUrl: documentRelPath(fileId),
    uploadedAt: new Date(),
    verificationStatus: 'Pending'
  };

  const user = await User.findById(req.user._id);
  user.uploadedDocuments.push(docRef);
  await user.save();

  res.status(201).json({ success: true, message: 'Document uploaded', fileId, document: docRef });
});

/** GET /api/documents — the caller's own documents. */
export const listMyDocuments = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('uploadedDocuments');
  res.status(200).json({ success: true, data: user.uploadedDocuments });
});

/** GET /api/documents/user/:userId — HR/admin view of any user's vault. */
export const listUserDocuments = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) throw new ApiError(400, 'Invalid user id');
  const user = await User.findById(req.params.userId).select('uploadedDocuments personalDetails');
  if (!user) throw new ApiError(404, 'User not found');
  res.status(200).json({ success: true, data: user.uploadedDocuments });
});

/**
 * GET /api/documents/file/:fileId
 * Authorized stream of a stored PDF. Owners get their own; admin/HR get any.
 * Raw disk paths are never exposed.
 */
export const streamDocument = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!isFileId(fileId)) throw new ApiError(400, 'Invalid document id');

  const relPath = documentRelPath(fileId);
  const owner = await User.findOne({ 'uploadedDocuments.fileUrl': relPath }).select('_id uploadedDocuments');
  if (!owner) throw new ApiError(404, 'Document not found');

  const isOwner = owner._id.equals(req.user._id);
  const isManager = ['admin', 'hr'].includes(req.user.role);
  if (!isOwner && !isManager) throw new ApiError(403, 'Not authorized to access this document');

  const abs = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Document file is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileId}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});

/**
 * PATCH /api/documents/file/:fileId/verify — US 6.3
 * HR/admin sets a verification status on a document.
 * Body: { status: Pending|Verified|Rejected }
 */
export const verifyDocument = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!isFileId(fileId)) throw new ApiError(400, 'Invalid document id');

  const relPath = documentRelPath(fileId);
  const user = await User.findOne({ 'uploadedDocuments.fileUrl': relPath });
  if (!user) throw new ApiError(404, 'Document not found');

  const doc = user.uploadedDocuments.find((d) => d.fileUrl === relPath);
  doc.verificationStatus = req.body.status;
  await user.save();
  const who = `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`.trim() || user.email;
  await logActivity({
    actor: req.user,
    action: `document.${String(req.body.status || '').toLowerCase()}`,
    entityType: 'UserDocument',
    entityId: fileId,
    message: `${doc.documentName || doc.documentType} marked ${req.body.status} for ${who}`
  });

  res.status(200).json({ success: true, message: `Document marked ${doc.verificationStatus}`, document: doc });
});

/**
 * DELETE /api/documents/file/:fileId — owner removes an unverified document.
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!isFileId(fileId)) throw new ApiError(400, 'Invalid document id');

  const relPath = documentRelPath(fileId);
  const user = await User.findById(req.user._id);
  const doc = user.uploadedDocuments.find((d) => d.fileUrl === relPath);
  if (!doc) throw new ApiError(404, 'Document not found in your vault');
  if (doc.verificationStatus === 'Verified') throw new ApiError(400, 'Verified documents cannot be deleted');

  user.uploadedDocuments = user.uploadedDocuments.filter((d) => d.fileUrl !== relPath);
  await user.save();
  await fsp.unlink(path.resolve(process.cwd(), relPath)).catch(() => {});

  res.status(200).json({ success: true, message: 'Document deleted' });
});
