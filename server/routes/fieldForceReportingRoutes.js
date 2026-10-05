import { Router } from 'express';
import {
  getCalendar, getMyAlerts, getMyDashboard, getMonitor, getMyReportingChain, getJointCallParticipants,
  getTeamPerformance, getTeamAttendance, getOrgSummary, getTierDirectory, getReportsSummary
} from '../controllers/fieldForceReportingController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldTier, requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';

// Mounted at /api/field-force (alongside the Domain 1 /team endpoint).
const router = Router();
router.use(verifyToken);

router.get('/my-chain', requireFieldTier('BDM'), getMyReportingChain);
router.get('/joint-call-participants', requireFieldTier('BDM'), getJointCallParticipants);
router.get('/calendar', requireFieldTier('BDM'), getCalendar);
router.get('/alerts', requireFieldTier('BDM'), getMyAlerts);
router.get('/dashboard', requireFieldTier('BDM'), getMyDashboard);
router.get('/monitor', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), getMonitor);
router.get('/team-performance', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), getTeamPerformance);
router.get('/team-attendance', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), getTeamAttendance);

// Executive monitoring — same capability gate as the manager-level endpoints above: a manager-role
// JobRole holder (their own subtree), or admin/superadmin via their existing FIELDOPS_MONITOR
// permission. Read-only: no approval/decision route.
router.get('/org-summary', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), getOrgSummary);
router.get('/tier-directory', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), getTierDirectory);
router.get('/reports-summary', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), getReportsSummary);

export default router;
