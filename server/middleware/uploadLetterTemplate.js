import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

export const LETTER_TEMPLATE_DIR = path.resolve('uploads', 'letter-templates');
fs.mkdirSync(LETTER_TEMPLATE_DIR, { recursive: true });

const ALLOWED_MIME = new Map([
  ['application/pdf', '.pdf']
]);

export const letterTemplateFolderFor = (type = 'General') => {
  const safeType = String(type || 'General').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'General';
  const dir = path.resolve(LETTER_TEMPLATE_DIR, safeType);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const letterTemplateRelPath = (type, filename) => {
  const safeType = String(type || 'General').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'General';
  return `uploads/letter-templates/${safeType}/${filename}`;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body?.type || 'General';
    cb(null, letterTemplateFolderFor(type));
  },
  filename: (req, file, cb) => {
    const type = String(req.body?.type || 'General').trim() || 'General';
    const safeName = String(file.originalname || 'template')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'template';
    const ext = ALLOWED_MIME.get(file.mimetype) || path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${type}-${safeName}-${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ext === '.pdf') return cb(null, true);
  cb(new ApiError(400, 'Letter template must be a PDF'));
};

/** Single-file letter template upload (field "file"), max 15MB. */
export const uploadLetterTemplateFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
}).single('file');
