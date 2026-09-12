import { Router } from 'express';
import { getDashboardStats, getDashboardActivity } from '../controllers/dashboardController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken);

router.get('/stats', requirePermission(PERMISSIONS.DASHBOARD_READ), getDashboardStats);
router.get('/activity', requirePermission(PERMISSIONS.DASHBOARD_READ), getDashboardActivity);

export default router;
