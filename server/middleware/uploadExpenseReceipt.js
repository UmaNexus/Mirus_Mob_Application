import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// Expense receipts (photo or PDF). NOT statically served — only reachable
// through the authorized GET /api/expenses/:id/receipt route, matching the
// existing sensitive-document pattern in uploadDocument.js.
export const RECEIPT_DIR = path.resolve(process.cwd(), 'uploads', 'receipts');
fs.mkdirSync(RECEIPT_DIR, { recursive: true });

const EXT_BY_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECEIPT_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${EXT_BY_MIME[file.mimetype] || ''}`)
});

const fileFilter = (req, file, cb) => {
  if (!EXT_BY_MIME[file.mimetype]) {
    return cb(new ApiError(400, 'Receipt must be a PDF, JPEG, or PNG file'));
  }
  cb(null, true);
};

/** Single receipt upload, field "receipt", max 5MB. */
export const uploadExpenseReceipt = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
}).single('receipt');
