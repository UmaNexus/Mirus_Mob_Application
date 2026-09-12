import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import mongoose from 'mongoose';
import PerformanceReview from '../models/PerformanceReview.js';
import { Incentive, Appraisal, TrainingRecord } from '../models/performanceExtras.js';
import { documentRelPath } from '../middleware/uploadDocument.js';
import { roleHasPermission, PERMISSIONS } from '../config/permissions.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';

const ensureUserId = (id) => { if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Valid userId is required'); };

/** Record owner or a caller holding performance:manage may view its attachment. */
const canAccessRecord = (record, req) =>
  String(record.userId) === String(req.user._id) || roleHasPermission(req.user.role, PERMISSIONS.PERFORMANCE_MANAGE);

const streamAttachment = async (Model, id, req, res) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid id');
  const record = await Model.findById(id);
  if (!record) throw new ApiError(404, 'Record not found');
  if (!canAccessRecord(record, req)) throw new ApiError(403, 'Not permitted');
  if (!record.attachmentFileId) throw new ApiError(404, 'No attachment on this record');
  const abs = path.resolve(process.cwd(), documentRelPath(record.attachmentFileId));
  if (!fs.existsSync(abs)) throw new ApiError(404, 'File missing on disk');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${record.attachmentFileName || 'attachment.pdf'}"`);
  fs.createReadStream(abs).pipe(res);
};

// ---------- Performance reviews ----------

export const createReview = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, period, kpis, overallRating, comments, status } = req.body;
  if (!period) throw new ApiError(400, 'period is required');
  const review = await PerformanceReview.create({
    userId, period, kpis: kpis || [], overallRating: overallRating || 0, comments,
    reviewerId: req.user._id, status: status === 'Published' ? 'Published' : 'Draft'
  });
  await logActivity({
    actor: req.user,
    action: 'performance.review',
    entityType: 'PerformanceReview',
    entityId: review._id,
    message: `Performance review saved for period ${period}`
  });
  res.status(201).json({ success: true, message: 'Review saved', review });
});

export const updateReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid review id');
  const review = await PerformanceReview.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  ['period', 'kpis', 'overallRating', 'comments', 'status'].forEach((k) => {
    if (req.body[k] !== undefined) review[k] = req.body[k];
  });
  await review.save();
  res.status(200).json({ success: true, message: 'Review updated', review });
});

export const listReviews = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const [data, total] = await Promise.all([
    PerformanceReview.find(filter)
      .populate('userId', 'personalDetails employeeDetails.employeeId email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    PerformanceReview.countDocuments(filter)
  ]);
  res.status(200).json({
    success: true,
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

/** Employees see only their own published reviews. */
export const listMyReviews = asyncHandler(async (req, res) => {
  const data = await PerformanceReview.find({ userId: req.user._id, status: 'Published' }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
});

// ---------- Incentives ----------

export const createIncentive = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, period, amount, reason, status } = req.body;
  if (!period || amount == null) throw new ApiError(400, 'period and amount are required');
  const incentive = await Incentive.create({
    userId, period, amount, reason, status,
    attachmentFileId: req.file ? path.parse(req.file.filename).name : null,
    attachmentFileName: req.file ? req.file.originalname : null
  });
  await logActivity({
    actor: req.user,
    action: 'performance.incentive',
    entityType: 'Incentive',
    entityId: incentive._id,
    message: `Incentive recorded for period ${period}`
  });
  res.status(201).json({ success: true, message: 'Incentive recorded', incentive });
});

export const listIncentives = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const [data, total] = await Promise.all([
    Incentive.find(filter)
      .populate('userId', 'personalDetails employeeDetails.employeeId email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Incentive.countDocuments(filter)
  ]);
  res.status(200).json({
    success: true,
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

export const listMyIncentives = asyncHandler(async (req, res) => {
  const data = await Incentive.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
});

export const streamIncentiveAttachment = asyncHandler(async (req, res) => {
  await streamAttachment(Incentive, req.params.id, req, res);
});

// ---------- Appraisals / promotions ----------

export const createAppraisal = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, effectiveDate, previousDesignation, newDesignation, previousCTC, newCTC, remarks } = req.body;
  if (!effectiveDate) throw new ApiError(400, 'effectiveDate is required');
  const appraisal = await Appraisal.create({
    userId, effectiveDate, previousDesignation, newDesignation, previousCTC, newCTC, remarks,
    attachmentFileId: req.file ? path.parse(req.file.filename).name : null,
    attachmentFileName: req.file ? req.file.originalname : null
  });
  res.status(201).json({ success: true, message: 'Appraisal recorded', appraisal });
});

export const listAppraisals = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const [data, total] = await Promise.all([
    Appraisal.find(filter)
      .populate('userId', 'personalDetails employeeDetails.employeeId email')
      .sort({ effectiveDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Appraisal.countDocuments(filter)
  ]);
  res.status(200).json({
    success: true,
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

/** Employees see their own promotion/appraisal history. */
export const listMyAppraisals = asyncHandler(async (req, res) => {
  const data = await Appraisal.find({ userId: req.user._id }).sort({ effectiveDate: -1 });
  res.status(200).json({ success: true, data });
});

export const streamAppraisalAttachment = asyncHandler(async (req, res) => {
  await streamAttachment(Appraisal, req.params.id, req, res);
});

// ---------- Training records (manual log) ----------

export const createTrainingRecord = asyncHandler(async (req, res) => {
  ensureUserId(req.body.userId);
  const { userId, title, provider, completedAt, status, certificateFileUrl } = req.body;
  if (!title) throw new ApiError(400, 'title is required');
  const record = await TrainingRecord.create({ userId, title, provider, completedAt, status, certificateFileUrl });
  res.status(201).json({ success: true, message: 'Training record saved', record });
});

export const listTrainingRecords = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId && mongoose.isValidObjectId(req.query.userId)) filter.userId = req.query.userId;
  const data = await TrainingRecord.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, data });
});

export const listMyTrainingRecords = asyncHandler(async (req, res) => {
  const data = await TrainingRecord.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
});

const unlinkAttachment = async (fileId) => {
  if (!fileId) return;
  try { await fsp.unlink(path.resolve(process.cwd(), documentRelPath(fileId))); } catch { /* ignore */ }
};

/** DELETE /api/performance/reviews/:id */
export const deleteReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid review id');
  const review = await PerformanceReview.findByIdAndDelete(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  await logActivity({
    actor: req.user,
    action: 'performance.review.delete',
    entityType: 'PerformanceReview',
    entityId: req.params.id,
    message: `Performance review deleted (${review.period})`
  });
  res.status(200).json({ success: true, message: 'Review deleted' });
});

/** DELETE /api/performance/incentives/:id */
export const deleteIncentive = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid incentive id');
  const incentive = await Incentive.findByIdAndDelete(req.params.id);
  if (!incentive) throw new ApiError(404, 'Incentive not found');
  await unlinkAttachment(incentive.attachmentFileId);
  await logActivity({
    actor: req.user,
    action: 'performance.incentive.delete',
    entityType: 'Incentive',
    entityId: req.params.id,
    message: `Incentive deleted (${incentive.period})`
  });
  res.status(200).json({ success: true, message: 'Incentive deleted' });
});

/** DELETE /api/performance/appraisals/:id */
export const deleteAppraisal = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid appraisal id');
  const appraisal = await Appraisal.findByIdAndDelete(req.params.id);
  if (!appraisal) throw new ApiError(404, 'Appraisal not found');
  await unlinkAttachment(appraisal.attachmentFileId);
  await logActivity({
    actor: req.user,
    action: 'performance.appraisal.delete',
    entityType: 'Appraisal',
    entityId: req.params.id,
    message: `Promotion/appraisal deleted`
  });
  res.status(200).json({ success: true, message: 'Appraisal deleted' });
});

/** DELETE /api/performance/training-records/:id */
export const deleteTrainingRecord = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid training record id');
  const record = await TrainingRecord.findByIdAndDelete(req.params.id);
  if (!record) throw new ApiError(404, 'Training record not found');
  await logActivity({
    actor: req.user,
    action: 'performance.training.delete',
    entityType: 'TrainingRecord',
    entityId: req.params.id,
    message: `Training record deleted (${record.title})`
  });
  res.status(200).json({ success: true, message: 'Training record deleted' });
});
