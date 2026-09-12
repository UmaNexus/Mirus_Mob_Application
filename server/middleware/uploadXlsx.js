import path from 'node:path';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream' // some clients send this for .xlsx
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ext === '.xlsx' || ext === '.xls') {
    return cb(null, true);
  }
  cb(new ApiError(400, 'Upload must be an .xlsx/.xls spreadsheet'));
};

/**
 * In-memory upload for the bulk offer roster (US 3.2). Kept in a buffer (not
 * disk) since it is parsed immediately and discarded. Field name: "roster".
 */
export const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
}).single('roster');
