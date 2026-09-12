import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// Sensitive documents (PAN/Aadhar/certificates). NOT statically served — only
// reachable through the authorized GET /api/documents/file/:fileId route.
export const DOCUMENT_DIR = path.resolve(process.cwd(), 'uploads', 'documents');
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });

// Build a repo-relative URL with forward slashes from a stored file id.
export const documentRelPath = (fileId) => `uploads/documents/${fileId}.pdf`;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCUMENT_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.pdf`)
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype !== 'application/pdf') {
    return cb(new ApiError(400, 'Only PDF documents are accepted'));
  }
  cb(null, true);
};

/** Single PDF upload, field "document", max 5MB (US 6.2 acceptance criteria). */
export const uploadDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
}).single('document');
