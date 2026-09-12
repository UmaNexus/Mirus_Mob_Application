import { Router } from 'express';
import {
  createManagerFieldCall, listMyManagerFieldCalls, listTeamManagerFieldCalls
} from '../controllers/managerFieldCallController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createManagerFieldCallRules } from '../validators/managerFieldCallValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/manager-field-calls. ASM+ only — a BDM's own visits go
// through /api/dcr instead (kept as a separate model per client decision).
const router = Router();
router.use(verifyToken);

router.post('/', requireFieldCapability(PERMISSIONS.FIELDCALL_LOG, 'ASM'), createManagerFieldCallRules, validate, createManagerFieldCall);
router.get('/', requireFieldCapability(PERMISSIONS.FIELDCALL_LOG, 'ASM'), listMyManagerFieldCalls);
router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamManagerFieldCalls);

export default router;
