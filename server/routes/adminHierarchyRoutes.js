import { Router } from 'express';
import { getHierarchy, getPermissionsCatalog, replaceManager } from '../controllers/adminHierarchyController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { replaceManagerRules } from '../validators/adminHierarchyValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/admin. Every route is gated by USER_ROLE_CHANGE — the one
// existing permission only admin/superadmin actually hold (HR's role grant
// deliberately excludes it), reusing the existing permission system rather
// than inventing an admin-only role check of its own.
const router = Router();
router.use(verifyToken);
router.use(requirePermission(PERMISSIONS.USER_ROLE_CHANGE));

router.get('/hierarchy', getHierarchy);
router.get('/permissions', getPermissionsCatalog);
router.post('/hierarchy/replace-manager', replaceManagerRules, validate, replaceManager);

export default router;
