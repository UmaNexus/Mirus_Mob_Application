import { Router } from 'express';
import { createTenant, listTenants } from '../controllers/tenantController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();

// Tenant management is platform-level: superadmin only.
router.use(verifyToken, requirePermission(PERMISSIONS.TENANT_MANAGE));

router.post('/', createTenant);
router.get('/', listTenants);

export default router;
