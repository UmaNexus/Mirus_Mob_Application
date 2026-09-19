import { Router } from 'express';
import {
  getCalendar, getMyAlerts, getMyDashboard, getMonitor, getMyReportingChain, getJointCallParticipants,
  getTeamPerformance, getTeamAttendance
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

export default router;
