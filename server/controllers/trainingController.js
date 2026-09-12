import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import mongoose from 'mongoose';
import { TrainingSection, TrainingMedia, TrainingProgress } from '../models/trainingLibrary.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';

// ---------- Sections ----------

export const createSection = asyncHandler(async (req, res) => {
  const { title, description, order } = req.body;
  if (!title) throw new ApiError(400, 'title is required');
  const section = await TrainingSection.create({
    companyId: req.user.companyId,
    title,
    description,
    order: order || 0
  });
  await logActivity({
    actor: req.user,
    action: 'training.section',
    entityType: 'TrainingSection',
    entityId: section._id,
    message: `Training section "${title}" created`
  });
  res.status(201).json({ success: true, message: 'Section created', section });
});

/** DELETE /api/training/sections/:id — remove section and its media. */
export const deleteSection = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid section id');
  const section = await TrainingSection.findById(req.params.id);
  if (!section) throw new ApiError(404, 'Section not found');
  const media = await TrainingMedia.find({ sectionId: section._id });
  for (const m of media) {
    try { await fsp.unlink(path.resolve(process.cwd(), m.videoFileUrl)); } catch { /* ignore */ }
    await TrainingProgress.deleteMany({ mediaId: m._id });
    await m.deleteOne();
  }
  await section.deleteOne();
  await logActivity({
    actor: req.user,
    action: 'training.section.delete',
    entityType: 'TrainingSection',
    entityId: req.params.id,
    message: `Training section "${section.title}" deleted`
  });
  res.status(200).json({ success: true, message: 'Section deleted' });
});

export const listSections = asyncHandler(async (req, res) => {
  const data = await TrainingSection.find().sort({ order: 1, title: 1 });
  res.status(200).json({ success: true, data });
});

// ---------- Media ----------

export const uploadMedia = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No video uploaded (field "video")');
  const { sectionId, title, description, durationSec, order } = req.body;
  if (!mongoose.isValidObjectId(sectionId)) throw new ApiError(400, 'Valid sectionId is required');
  if (!String(title || '').trim()) throw new ApiError(400, 'title is required');
  const section = await TrainingSection.findById(sectionId);
  if (!section) throw new ApiError(404, 'Section not found');

  // Stamp companyId explicitly — Multer can resume outside AsyncLocalStorage,
  // so tenantScope's pre-validate stamp is not always available here.
  const media = await TrainingMedia.create({
    companyId: req.user.companyId,
    sectionId,
    title: String(title).trim(),
    description: description ? String(description).trim() : undefined,
    videoFileUrl: `uploads/training/${req.file.filename}`,
    durationSec: Number(durationSec) || 0,
    order: Number(order) || 0
  });
  await logActivity({
    actor: req.user,
    action: 'training.media',
    entityType: 'TrainingMedia',
    entityId: media._id,
    message: `Training video "${title}" uploaded`
  });
  res.status(201).json({ success: true, message: 'Training video uploaded', media });
});

/** DELETE /api/training/media/:id */
export const deleteMedia = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid media id');
  const media = await TrainingMedia.findById(req.params.id);
  if (!media) throw new ApiError(404, 'Video not found');
  try { await fsp.unlink(path.resolve(process.cwd(), media.videoFileUrl)); } catch { /* ignore */ }
  await TrainingProgress.deleteMany({ mediaId: media._id });
  await media.deleteOne();
  await logActivity({
    actor: req.user,
    action: 'training.media.delete',
    entityType: 'TrainingMedia',
    entityId: req.params.id,
    message: `Training video "${media.title}" deleted`
  });
  res.status(200).json({ success: true, message: 'Video deleted' });
});

export const listMedia = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.sectionId && mongoose.isValidObjectId(req.query.sectionId)) filter.sectionId = req.query.sectionId;
  const data = await TrainingMedia.find(filter).sort({ order: 1, createdAt: 1 }).select('-__v');
  res.status(200).json({ success: true, data });
});

/** GET /api/training/media/:id/stream — authorized, HTTP Range video stream. */
export const streamMedia = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid media id');
  const media = await TrainingMedia.findById(req.params.id);
  if (!media) throw new ApiError(404, 'Video not found');

  const abs = path.resolve(process.cwd(), media.videoFileUrl);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Video file missing on disk');

  const { size } = fs.statSync(abs);
  const range = req.headers.range;
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';

  if (!range) {
    res.writeHead(200, { 'Content-Length': size, 'Content-Type': mime });
    return fs.createReadStream(abs).pipe(res);
  }
  // Parse "bytes=start-end".
  const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
  const start = parseInt(startStr, 10) || 0;
  const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1_000_000, size - 1);
  if (start >= size) { res.status(416).setHeader('Content-Range', `bytes */${size}`); return res.end(); }
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': mime
  });
  fs.createReadStream(abs, { start, end }).pipe(res);
});

// ---------- Progress ----------

/** POST /api/training/media/:id/progress — employee updates own progress. */
export const setProgress = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid media id');
  const status = req.body.status || 'completed';
  if (!['assigned', 'in-progress', 'completed'].includes(status)) throw new ApiError(400, 'Invalid status');

  const progress = await TrainingProgress.findOneAndUpdate(
    { userId: req.user._id, mediaId: req.params.id },
    { $set: { status, completedAt: status === 'completed' ? new Date() : null }, $setOnInsert: { userId: req.user._id, mediaId: req.params.id } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  res.status(200).json({ success: true, message: 'Progress updated', progress });
});

export const listMyProgress = asyncHandler(async (req, res) => {
  const data = await TrainingProgress.find({ userId: req.user._id });
  res.status(200).json({ success: true, data });
});
