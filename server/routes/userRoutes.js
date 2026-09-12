import { Router } from 'express';
import {
  listUsers,
  getUserById,
  getEmployeeOverview,
  updateUser,
  softDeleteUser,
  restoreUser,
  permanentDeleteUser,
  generateCredentials,
  sendPasswordResetLink
} from '../controllers/userController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { updateUserRules } from '../validators/userValidators.js';
import validate from '../middleware/validate.js';

const router = Router();

router.use(verifyToken);

// Read/create/update are HR+Admin; delete, restore and role-change are Admin-only
// (role-change enforced inside updateUser). Granular RBAC per Epic R.
router.get('/', requirePermission(PERMISSIONS.USER_READ), listUsers);
router.get('/:id/overview', requirePermission(PERMISSIONS.USER_READ), getEmployeeOverview);
router.get('/:id', requirePermission(PERMISSIONS.USER_READ), getUserById);
router.put('/:id', requirePermission(PERMISSIONS.USER_UPDATE), updateUserRules, validate, updateUser);
router.delete('/:id', requirePermission(PERMISSIONS.USER_DELETE), softDeleteUser);
router.delete('/:id/permanent', requirePermission(PERMISSIONS.USER_DELETE), permanentDeleteUser);
router.post('/:id/restore', requirePermission(PERMISSIONS.USER_RESTORE), restoreUser);
router.post('/:id/credentials', requirePermission(PERMISSIONS.USER_CREDENTIALS), generateCredentials);
router.post('/:id/reset-link', requirePermission(PERMISSIONS.USER_CREDENTIALS), sendPasswordResetLink);

export default router;
