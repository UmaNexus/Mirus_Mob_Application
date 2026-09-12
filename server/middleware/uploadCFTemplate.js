import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

export const CF_TEMPLATE_DIR = path.resolve('uploads', 'cf-templates');
fs.mkdirSync(CF_TEMPLATE_DIR, { recursive: true });

const ALLOWED_MIME = new Map([
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx']
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CF_TEMPLATE_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME.get(file.mimetype) || path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ['.pdf', '.doc', '.docx'].includes(ext)) {
    return cb(null, true);
  }
  cb(new ApiError(400, 'C&F template must be a PDF or Word document'));
};

/** Single-file C&F template upload (field "file"), max 15MB. */
export const uploadCFTemplateFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
}).single('file');

export const cfTemplateRelPath = (filename) => `uploads/cf-templates/${filename}`;
