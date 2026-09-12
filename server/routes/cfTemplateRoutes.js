import { Router } from 'express';
import {
  listCFTemplates,
  createCFTemplate,
  updateCFTemplate,
  deleteCFTemplate,
  downloadCFTemplateFile
} from '../controllers/cfTemplateController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { uploadCFTemplateFile } from '../middleware/uploadCFTemplate.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken, requirePermission(PERMISSIONS.TEMPLATE_MANAGE));

router.get('/', listCFTemplates);
router.post('/', uploadCFTemplateFile, createCFTemplate);
router.get('/:id/file', downloadCFTemplateFile);
router.put('/:id', uploadCFTemplateFile, updateCFTemplate);
router.delete('/:id', deleteCFTemplate);

export default router;
