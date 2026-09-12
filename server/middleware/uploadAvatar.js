import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// Avatars live in a dedicated, web-served directory. Documents (PAN/Aadhar)
// are stored separately and only served via an authorized route.
export const AVATAR_DIR = path.resolve('uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png']
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    // Randomized UUID filename — never trust/leak the client-supplied name.
    const ext = ALLOWED_MIME.get(file.mimetype) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new ApiError(400, 'Avatar must be a JPEG or PNG image'));
  }
  cb(null, true);
};

/**
 * Single-file avatar upload guard: field name "avatar", max 2MB,
 * JPEG/PNG only. Errors flow to the central error handler.
 */
export const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
}).single('avatar');
