import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// Company branding assets. Served via authorized GET /api/company/asset/:kind.
export const COMPANY_ASSET_DIR = path.resolve('uploads', 'company');
fs.mkdirSync(COMPANY_ASSET_DIR, { recursive: true });

const IMAGE_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png']
]);

const PDF_MIME = new Map([
  ['application/pdf', '.pdf']
]);

/** Kinds that may be PDF (letter header image/PDF, letter outline PDF). */
export const PDF_ASSET_KINDS = new Set(['letterhead', 'letterOutline']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COMPANY_ASSET_DIR),
  filename: (req, file, cb) => {
    const ext = IMAGE_MIME.get(file.mimetype)
      || PDF_MIME.get(file.mimetype)
      || path.extname(file.originalname).toLowerCase()
      || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const kind = req.params?.kind;
  if (IMAGE_MIME.has(file.mimetype)) return cb(null, true);
  if (PDF_ASSET_KINDS.has(kind) && (PDF_MIME.has(file.mimetype) || path.extname(file.originalname).toLowerCase() === '.pdf')) {
    return cb(null, true);
  }
  if (PDF_ASSET_KINDS.has(kind)) {
    return cb(new ApiError(400, `${kind} must be a JPEG, PNG, or PDF file`));
  }
  cb(new ApiError(400, 'Asset must be a JPEG or PNG image'));
};

/** Single-file company asset upload (field name "asset"), max 8MB. */
export const uploadCompanyAsset = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }
}).single('asset');
