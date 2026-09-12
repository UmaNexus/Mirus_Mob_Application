import { Router } from 'express';
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment
} from '../controllers/departmentController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken);

router.get('/', listDepartments);
router.post('/', requirePermission(PERMISSIONS.TEMPLATE_MANAGE), createDepartment);
router.put('/:id', requirePermission(PERMISSIONS.TEMPLATE_MANAGE), updateDepartment);
router.delete('/:id', requirePermission(PERMISSIONS.TEMPLATE_MANAGE), deleteDepartment);

export default router;
