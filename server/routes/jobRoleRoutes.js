import { Router } from 'express';
import {
  listJobRoles, createJobRole, updateJobRole, deleteJobRole
} from '../controllers/jobRoleController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken);

// Any authenticated manager who can edit users / templates can manage roles.
router.get('/', listJobRoles);
router.post('/', requirePermission(PERMISSIONS.TEMPLATE_MANAGE), createJobRole);
router.put('/:id', requirePermission(PERMISSIONS.TEMPLATE_MANAGE), updateJobRole);
router.delete('/:id', requirePermission(PERMISSIONS.TEMPLATE_MANAGE), deleteJobRole);

export default router;
