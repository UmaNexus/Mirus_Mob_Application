import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import LetterTemplate, {
  LETTER_TYPES, LETTER_PLACEHOLDERS, LETTER_TYPE_LABELS, DEFAULT_LETTER_EMAIL
} from '../models/LetterTemplate.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { LETTER_TEMPLATE_DIR, letterTemplateRelPath } from '../middleware/uploadLetterTemplate.js';
import { fieldsForLetterType } from '../config/letterFields.js';
import { extractLetterTemplateFromPdf } from '../services/placeholderDetectService.js';

const present = (t) => {
  const o = t.toObject ? t.toObject() : { ...t };
  o.typeLabel = LETTER_TYPE_LABELS[o.type] || o.type;
  o.hasFile = Boolean(o.fileUrl);
  const defaults = DEFAULT_LETTER_EMAIL[o.type] || {};
  o.emailSubject = o.emailSubject || defaults.subject || '';
  o.emailBody = o.emailBody || defaults.body || '';
  o.detectedPlaceholders = Array.isArray(o.detectedPlaceholders) ? o.detectedPlaceholders : [];
  return o;
};

const unlinkQuiet = async (rel) => {
  if (!rel) return;
  try { await fsp.unlink(path.resolve(rel)); } catch { /* ignore */ }
};

const parseBool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  return v === true || v === 'true' || v === '1';
};

/**
 * Extract placeholders from an uploaded PDF for all letter types.
 * Appointment letters also sync the PDF body/title when requested.
 */
const applyPdfExtract = async (payload, fileRelPath, { overwriteBody = false } = {}) => {
  if (!fileRelPath) return;
  const extracted = await extractLetterTemplateFromPdf(fileRelPath);
  payload.detectedPlaceholders = extracted.placeholders || [];
  if (payload.type === 'AppointmentLetter' && overwriteBody && extracted.bodyParagraphs?.length) {
    payload.bodyParagraphs = extracted.bodyParagraphs;
  }
  if (payload.type === 'AppointmentLetter' && overwriteBody && extracted.title) {
    if (!(payload.title && String(payload.title).trim()) || payload.syncTitleFromPdf) {
      payload.title = extracted.title;
    }
  }
};

/** Clear isDefault on other templates of the same type within the tenant. */
const clearOtherDefaults = async (type, exceptId) => {
  await LetterTemplate.updateMany(
    { type, isDefault: true, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { $set: { isDefault: false } }
  );
};

/** GET /api/letter-templates?type=&active= */
export const listLetterTemplates = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) {
    if (!LETTER_TYPES.includes(req.query.type)) {
      throw new ApiError(400, `type must be one of: ${LETTER_TYPES.join(', ')}`);
    }
    filter.type = req.query.type;
  }
  if (req.query.active === 'true') filter.active = true;
  if (req.query.active === 'false') filter.active = false;

  const data = await LetterTemplate.find(filter).sort({ type: 1, isDefault: -1, name: 1 });
  res.status(200).json({
    success: true,
    data: data.map(present),
    meta: {
      types: LETTER_TYPES,
      typeLabels: LETTER_TYPE_LABELS,
      placeholders: LETTER_PLACEHOLDERS,
      emailDefaults: DEFAULT_LETTER_EMAIL,
      fieldsByType: Object.fromEntries(LETTER_TYPES.map((t) => [t, fieldsForLetterType(t)]))
    }
  });
});

/**
 * POST /api/letter-templates
 * JSON or multipart: type, name, title?, bodyParagraphs?, emailSubject?, emailBody?, isDefault?, file?
 */
export const createLetterTemplate = asyncHandler(async (req, res) => {
  const type = req.body.type;
  const name = (req.body.name || '').trim();
  const title = (req.body.title || '').trim();
  let bodyParagraphs = req.body.bodyParagraphs;
  if (typeof bodyParagraphs === 'string') {
    try { bodyParagraphs = JSON.parse(bodyParagraphs); } catch { bodyParagraphs = bodyParagraphs.split('\n'); }
  }
  if (!Array.isArray(bodyParagraphs)) bodyParagraphs = [];

  if (!LETTER_TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${LETTER_TYPES.join(', ')}`);
  if (!name) throw new ApiError(400, 'name is required');

  let isDefault = parseBool(req.body.isDefault, false);
  if (!isDefault) {
    const existingDefault = await LetterTemplate.exists({ companyId: req.user.companyId, type, active: true, isDefault: true });
    if (!existingDefault) isDefault = true;
  }
  if (isDefault) await clearOtherDefaults(type);

  const emailDefaults = DEFAULT_LETTER_EMAIL[type] || {};
  const emailSubject = (req.body.emailSubject != null ? String(req.body.emailSubject) : emailDefaults.subject || '').trim();
  const emailBody = (req.body.emailBody != null ? String(req.body.emailBody) : emailDefaults.body || '').trim();

  const payload = {
    companyId: req.user.companyId,
    type,
    name,
    title,
    bodyParagraphs: bodyParagraphs.map((s) => String(s).trim()).filter(Boolean),
    detectedPlaceholders: [],
    emailSubject,
    emailBody,
    isDefault,
    active: true
  };
  if (req.file) {
    payload.fileUrl = letterTemplateRelPath(type, req.file.filename);
    payload.originalFileName = req.file.originalname;
    payload.mimeType = req.file.mimetype || 'application/pdf';
    // Extract placeholder names from every uploaded PDF; appointment letters also
    // sync the body/title from the uploaded PDF when requested.
    const clientBodyEmpty = !payload.bodyParagraphs.length;
    await applyPdfExtract(payload, payload.fileUrl, {
      overwriteBody: type === 'AppointmentLetter' && (clientBodyEmpty || parseBool(req.body.syncBodyFromPdf, true))
    });
    if (type === 'AppointmentLetter' && !payload.title) {
      payload.title = 'APPOINTMENT LETTER';
    }
  }

  try {
    const template = await LetterTemplate.create(payload);
    res.status(201).json({ success: true, message: 'Letter template created', template: present(template) });
  } catch (err) {
    if (req.file) await unlinkQuiet(letterTemplateRelPath(type, req.file.filename));
    if (err?.code === 11000) throw new ApiError(409, 'A template with this name already exists for this type');
    throw err;
  }
});

/** PUT /api/letter-templates/:id — multipart optional file replace */
export const updateLetterTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await LetterTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Letter template not found');

  if (req.body.name !== undefined) template.name = String(req.body.name).trim();
  if (req.body.title !== undefined) template.title = String(req.body.title).trim();
  if (req.body.active !== undefined) template.active = parseBool(req.body.active, template.active);
  if (req.body.emailSubject !== undefined) template.emailSubject = String(req.body.emailSubject).trim();
  if (req.body.emailBody !== undefined) template.emailBody = String(req.body.emailBody);
  if (req.body.bodyParagraphs !== undefined) {
    let paras = req.body.bodyParagraphs;
    if (typeof paras === 'string') {
      try { paras = JSON.parse(paras); } catch { paras = paras.split('\n'); }
    }
    template.bodyParagraphs = Array.isArray(paras) ? paras.map((s) => String(s).trim()).filter(Boolean) : [];
  }
  if (req.body.isDefault !== undefined) {
    const nextDefault = parseBool(req.body.isDefault, false);
    if (nextDefault) await clearOtherDefaults(template.type, template._id);
    template.isDefault = nextDefault;
  }

  const previousFile = template.fileUrl;
  if (req.file) {
    template.fileUrl = letterTemplateRelPath(template.type, req.file.filename);
    template.originalFileName = req.file.originalname;
    template.mimeType = req.file.mimetype || 'application/pdf';

    const syncBody = template.type === 'AppointmentLetter' && parseBool(req.body.syncBodyFromPdf, true);
    const patch = {
      type: template.type,
      title: template.title,
      bodyParagraphs: template.bodyParagraphs,
      detectedPlaceholders: [],
      syncTitleFromPdf: syncBody && !(req.body.title && String(req.body.title).trim())
    };
    await applyPdfExtract(patch, template.fileUrl, { overwriteBody: syncBody });
    template.detectedPlaceholders = patch.detectedPlaceholders || [];
    if (syncBody && patch.bodyParagraphs?.length) {
      template.bodyParagraphs = patch.bodyParagraphs;
    }
    if (patch.title) template.title = patch.title;
  }

  try {
    await template.save();
  } catch (err) {
    if (req.file) await unlinkQuiet(letterTemplateRelPath(template.type, req.file.filename));
    if (err?.code === 11000) throw new ApiError(409, 'A template with this name already exists for this type');
    throw err;
  }

  if (req.file && previousFile && previousFile !== template.fileUrl) await unlinkQuiet(previousFile);

  res.status(200).json({ success: true, message: 'Letter template updated', template: present(template) });
});

/** DELETE /api/letter-templates/:id */
export const deleteLetterTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await LetterTemplate.findByIdAndDelete(req.params.id);
  if (!template) throw new ApiError(404, 'Letter template not found');
  await unlinkQuiet(template.fileUrl);
  res.status(200).json({ success: true, message: 'Letter template deleted' });
});

/** GET /api/letter-templates/:id/file — view uploaded template PDF */
export const downloadLetterTemplateFile = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await LetterTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Letter template not found');
  if (!template.fileUrl) throw new ApiError(404, 'No file uploaded for this template');

  const abs = path.resolve(template.fileUrl);
  if (!abs.startsWith(LETTER_TEMPLATE_DIR) || !fs.existsSync(abs)) {
    throw new ApiError(404, 'Template file missing on disk');
  }

  res.setHeader('Content-Type', template.mimeType || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${(template.originalFileName || 'letter-template.pdf').replace(/"/g, '')}"`
  );
  fs.createReadStream(abs).pipe(res);
});

/** Resolve default active letter template for a type (or first active). */
export const resolveDefaultLetterTemplate = async (type) => {
  const tpl = await LetterTemplate.findOne({ type, active: true }).sort({ isDefault: -1, createdAt: -1 });
  return tpl;
};
