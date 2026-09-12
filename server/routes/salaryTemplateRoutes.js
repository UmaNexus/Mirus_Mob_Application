import { Router } from 'express';
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deactivateTemplate,
  deleteInactiveTemplate
} from '../controllers/salaryTemplateController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createTemplateRules, updateTemplateRules } from '../validators/salaryValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken, requirePermission(PERMISSIONS.TEMPLATE_MANAGE));

router.post('/', createTemplateRules, validate, createTemplate);
router.get('/', listTemplates);
router.get('/:id', getTemplate);
router.put('/:id', updateTemplateRules, validate, updateTemplate);
router.delete('/:id/permanent', deleteInactiveTemplate);
router.delete('/:id', deactivateTemplate);

export default router;
