import { Router } from 'express';
import {
  listMyMtp, createMtp, updateMtp, submitMtp, withdrawMtp, decideMtp, listPendingApprovals, listTeamMtp, listEligibleApprovers
} from '../controllers/mtpController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createMtpRules, updateMtpRules, submitMtpRules, decisionMtpRules } from '../validators/mtpValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/mtp.
const router = Router();
router.use(verifyToken);

// BDM self-service. A BDM may hold several independent tour plans per month
// (see MonthlyTourPlan model) — POST always starts a new one, PATCH edits a
// specific still-editable one by id.
router.get('/', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), listMyMtp);
router.get('/approvers', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), listEligibleApprovers);
router.post('/', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), createMtpRules, validate, createMtp);
router.patch('/:id', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), updateMtpRules, validate, updateMtp);
router.patch('/:id/submit', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), submitMtpRules, validate, submitMtp);
router.patch('/:id/withdraw', requireFieldCapability(PERMISSIONS.MTP_SUBMIT, 'BDM'), withdrawMtp);

// ASM+ approval + team visibility.
router.get('/pending', requireFieldCapability(PERMISSIONS.MTP_APPROVE, 'ASM'), listPendingApprovals);
router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamMtp);
router.patch('/:id/decision', requireFieldCapability(PERMISSIONS.MTP_APPROVE, 'ASM'), decisionMtpRules, validate, decideMtp);

export default router;
