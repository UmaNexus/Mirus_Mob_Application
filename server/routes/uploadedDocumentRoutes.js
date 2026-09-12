import { Router } from 'express';
import {
  createType, listTypes, updateType, deleteType,
  uploadForEmployee, listMyRecords, listUserRecords, streamRecordPdf, acceptRecord, fillRecord
} from '../controllers/uploadedDocumentController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadDocument } from '../middleware/uploadDocument.js';

const router = Router();
router.use(verifyToken);

// Document-type configuration (HR).
router.post('/types', requirePermission(PERMISSIONS.DOCTYPE_MANAGE), createType);
router.get('/types', requirePermission(PERMISSIONS.DOCTYPE_MANAGE), listTypes);
router.put('/types/:id', requirePermission(PERMISSIONS.DOCTYPE_MANAGE), updateType);
router.delete('/types/:id', requirePermission(PERMISSIONS.DOCTYPE_MANAGE), deleteType);

// Self-service (declared before '/:id' paths).
router.get('/mine', listMyRecords);
router.post('/:id/accept', acceptRecord);
router.post('/:id/fill', fillRecord);
router.get('/:id/pdf', streamRecordPdf);

// HR upload + review.
router.post('/', requirePermission(PERMISSIONS.EMPLOYEE_DOC_ISSUE), uploadDocument, uploadForEmployee);
router.get('/user/:userId', requirePermission(PERMISSIONS.DOCUMENT_READ_ANY), listUserRecords);

export default router;
