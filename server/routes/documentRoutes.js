import { Router } from 'express';
import {
  uploadUserDocument,
  listMyDocuments,
  listUserDocuments,
  streamDocument,
  verifyDocument,
  deleteDocument
} from '../controllers/documentController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadDocument } from '../middleware/uploadDocument.js';
import { documentUploadRules, verifyDocumentRules } from '../validators/onboardingValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken);

// Self-service vault.
// Multer runs first so multipart body fields are available to the validators.
router.post('/', uploadDocument, documentUploadRules, validate, uploadUserDocument);
router.get('/', listMyDocuments);

// Authorized stream (ownership/role enforced in the controller).
router.get('/file/:fileId', streamDocument);
router.delete('/file/:fileId', deleteDocument);

// HR / admin review — granular RBAC (Epic R).
router.get('/user/:userId', requirePermission(PERMISSIONS.DOCUMENT_READ_ANY), listUserDocuments);
router.patch('/file/:fileId/verify', requirePermission(PERMISSIONS.DOCUMENT_VERIFY), verifyDocumentRules, validate, verifyDocument);

export default router;
