import { Router } from 'express';
import {
  getCFIssueFields,
  listCFIssues,
  createAndSendCFIssue,
  downloadCFIssuePdf
} from '../controllers/cfIssueController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken, requirePermission(PERMISSIONS.EMPLOYEE_DOC_ISSUE));

router.get('/fields', getCFIssueFields);
router.get('/', listCFIssues);
router.post('/', createAndSendCFIssue);
router.get('/:id/pdf', downloadCFIssuePdf);

export default router;
