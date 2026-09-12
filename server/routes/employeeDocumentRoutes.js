import { Router } from 'express';
import {
  issueDocument,
  listMyDocuments,
  listUserDocuments,
  streamDocumentPdf,
  acknowledgeDocument
} from '../controllers/employeeDocumentController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken);

// Self-service.
router.get('/mine', listMyDocuments);
router.get('/:id/pdf', streamDocumentPdf); // ownership/role enforced in controller
router.post('/:id/acknowledge', acknowledgeDocument);

// HR / admin.
router.post('/', requirePermission(PERMISSIONS.EMPLOYEE_DOC_ISSUE), issueDocument);
router.get('/user/:userId', requirePermission(PERMISSIONS.DOCUMENT_READ_ANY), listUserDocuments);

export default router;
