import { Router } from 'express';
import {
  listLetterTemplates,
  createLetterTemplate,
  updateLetterTemplate,
  deleteLetterTemplate,
  downloadLetterTemplateFile
} from '../controllers/letterTemplateController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { uploadLetterTemplateFile } from '../middleware/uploadLetterTemplate.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken, requirePermission(PERMISSIONS.TEMPLATE_MANAGE));

router.get('/', listLetterTemplates);
router.post('/', uploadLetterTemplateFile, createLetterTemplate);
router.get('/:id/file', downloadLetterTemplateFile);
router.put('/:id', uploadLetterTemplateFile, updateLetterTemplate);
router.delete('/:id', deleteLetterTemplate);

export default router;
