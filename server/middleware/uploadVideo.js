import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import { getStore, runWithStore } from '../utils/tenantContext.js';

// Training videos — NOT statically served; streamed via an authorized,
// range-supporting route (Epic 18).
export const TRAINING_DIR = path.resolve(process.cwd(), 'uploads', 'training');
fs.mkdirSync(TRAINING_DIR, { recursive: true });

/** Max training video size (bytes). Keep in sync with client UI + nginx. */
export const MAX_TRAINING_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_TRAINING_VIDEO_MB = 200;
export const TRAINING_VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
export const TRAINING_VIDEO_FORMAT_LABEL = 'MP4, WEBM, or MOV';

const ALLOWED_MIME = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  // Some browsers / OS pickers report these for the same containers.
  ['video/x-m4v', '.mp4'],
  ['application/mp4', '.mp4']
]);

const EXT_TO_MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

const resolveVideoKind = (file) => {
  const mime = String(file?.mimetype || '').toLowerCase().trim();
  const ext = path.extname(String(file?.originalname || '')).toLowerCase();
  if (ALLOWED_MIME.has(mime)) {
    return { mime, ext: ALLOWED_MIME.get(mime) };
  }
  if (EXT_TO_MIME[ext]) {
    return { mime: EXT_TO_MIME[ext], ext: ext === '.m4v' ? '.mp4' : ext };
  }
  return null;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TRAINING_DIR),
  filename: (req, file, cb) => {
    const kind = resolveVideoKind(file);
    cb(null, `${crypto.randomUUID()}${kind?.ext || '.mp4'}`);
  }
});

const fileFilter = (req, file, cb) => {
  const kind = resolveVideoKind(file);
  if (!kind) {
    return cb(new ApiError(400, `Video must be ${TRAINING_VIDEO_FORMAT_LABEL}`));
  }
  // Normalize empty/odd browser MIME so downstream code sees a real type.
  file.mimetype = kind.mime;
  cb(null, true);
};

const multerSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_TRAINING_VIDEO_BYTES, files: 1 }
}).single('video');

/**
 * Single training-video upload (field "video"), max 200MB.
 * Re-enters the tenant AsyncLocalStorage after Multer finishes — Multer's
 * busboy callbacks can otherwise resume outside the request store, which
 * made TrainingMedia.create fail with Mongoose "Validation failed" (companyId).
 */
export const uploadVideo = (req, res, next) => {
  const store = getStore();
  multerSingle(req, res, (err) => {
    const cont = () => (err ? next(err) : next());
    if (store) runWithStore({ ...store }, cont);
    else cont();
  });
};
