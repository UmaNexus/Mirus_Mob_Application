import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import CFTemplate, { CF_TEMPLATE_TYPES, CF_TEMPLATE_TYPE_LABELS } from '../models/CFTemplate.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { CF_TEMPLATE_DIR, cfTemplateRelPath } from '../middleware/uploadCFTemplate.js';

const present = (t) => {
  const o = t.toObject ? t.toObject() : { ...t };
  o.typeLabel = CF_TEMPLATE_TYPE_LABELS[o.type] || o.type;
  o.hasFile = Boolean(o.fileUrl);
  return o;
};

const unlinkQuiet = async (rel) => {
  if (!rel) return;
  try { await fsp.unlink(path.resolve(rel)); } catch { /* ignore missing */ }
};

/** GET /api/cf-templates?type= */
export const listCFTemplates = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) {
    if (!CF_TEMPLATE_TYPES.includes(req.query.type)) {
      throw new ApiError(400, `type must be one of: ${CF_TEMPLATE_TYPES.join(', ')}`);
    }
    filter.type = req.query.type;
  }
  if (req.query.active === 'true') filter.active = true;
  if (req.query.active === 'false') filter.active = false;

  const data = await CFTemplate.find(filter).sort({ type: 1, name: 1 });
  res.status(200).json({
    success: true,
    data: data.map(present),
    meta: { types: CF_TEMPLATE_TYPES, typeLabels: CF_TEMPLATE_TYPE_LABELS }
  });
});

/**
 * POST /api/cf-templates
 * multipart: type, name, description?, file? (PDF/Word)
 */
export const createCFTemplate = asyncHandler(async (req, res) => {
  const type = req.body.type;
  const name = (req.body.name || '').trim();
  const description = (req.body.description || '').trim();

  if (!CF_TEMPLATE_TYPES.includes(type)) {
    throw new ApiError(400, `type must be one of: ${CF_TEMPLATE_TYPES.join(', ')}`);
  }
  if (!name) throw new ApiError(400, 'name is required');

  const payload = {
    companyId: req.user.companyId,
    type,
    name,
    description,
    active: true
  };
  if (req.file) {
    payload.fileUrl = cfTemplateRelPath(req.file.filename);
    payload.originalFileName = req.file.originalname;
    payload.mimeType = req.file.mimetype || 'application/pdf';
  }

  try {
    const template = await CFTemplate.create(payload);
    res.status(201).json({ success: true, message: 'C&F template created', template: present(template) });
  } catch (err) {
    if (req.file) await unlinkQuiet(cfTemplateRelPath(req.file.filename));
    if (err?.code === 11000) throw new ApiError(409, 'A template with this name already exists for this type');
    throw err;
  }
});

/**
 * PUT /api/cf-templates/:id
 * multipart optional: name, description, active, file (replaces existing)
 */
export const updateCFTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await CFTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'C&F template not found');

  if (req.body.name !== undefined) template.name = String(req.body.name).trim();
  if (req.body.description !== undefined) template.description = String(req.body.description).trim();
  if (req.body.active !== undefined) {
    const v = req.body.active;
    template.active = v === true || v === 'true' || v === '1';
  }

  const previousFile = template.fileUrl;
  if (req.file) {
    template.fileUrl = cfTemplateRelPath(req.file.filename);
    template.originalFileName = req.file.originalname;
    template.mimeType = req.file.mimetype || 'application/pdf';
  }

  try {
    await template.save();
  } catch (err) {
    if (req.file) await unlinkQuiet(cfTemplateRelPath(req.file.filename));
    if (err?.code === 11000) throw new ApiError(409, 'A template with this name already exists for this type');
    throw err;
  }

  if (req.file && previousFile && previousFile !== template.fileUrl) {
    await unlinkQuiet(previousFile);
  }

  res.status(200).json({ success: true, message: 'C&F template updated', template: present(template) });
});

/** DELETE /api/cf-templates/:id */
export const deleteCFTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await CFTemplate.findByIdAndDelete(req.params.id);
  if (!template) throw new ApiError(404, 'C&F template not found');
  await unlinkQuiet(template.fileUrl);
  res.status(200).json({ success: true, message: 'C&F template deleted' });
});

/** GET /api/cf-templates/:id/file — stream the stored agreement PDF/Word. */
export const downloadCFTemplateFile = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await CFTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'C&F template not found');
  if (!template.fileUrl) throw new ApiError(404, 'No file uploaded for this template');

  const abs = path.resolve(template.fileUrl);
  if (!abs.startsWith(CF_TEMPLATE_DIR) || !fs.existsSync(abs)) {
    throw new ApiError(404, 'Template file missing on disk');
  }

  res.setHeader('Content-Type', template.mimeType || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${(template.originalFileName || 'cf-template.pdf').replace(/"/g, '')}"`
  );
  fs.createReadStream(abs).pipe(res);
});
