import { Router } from 'express';
import {
  listMyMtp, upsertMtp, submitMtp, withdrawMtp, decideMtp, listPendingApprovals, listTeamMtp
} from '../controllers/mtpController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { upsertMtpRules, submitMtpRules, decisionMtpRules } from '../validators/mtpValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/mtp.
const router = Router();
router.use(verifyToken);

// BDM self-service.
router.get('/', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), listMyMtp);
router.post('/', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), upsertMtpRules, validate, upsertMtp);
router.patch('/:id/submit', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), submitMtpRules, validate, submitMtp);
router.patch('/:id/withdraw', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), withdrawMtp);

// ASM+ approval + team visibility.
router.get('/pending', requireFieldCapability(PERMISSIONS.MTP_APPROVE, 'ASM'), listPendingApprovals);
router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamMtp);
router.patch('/:id/decision', requireFieldCapability(PERMISSIONS.MTP_APPROVE, 'ASM'), decisionMtpRules, validate, decideMtp);

export default router;
