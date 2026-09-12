import { Router } from 'express';
import { createDcr, listMyDcr, listTeamDcr, submitDay } from '../controllers/dcrController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createDcrRules, submitDayRules } from '../validators/dcrValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/dcr.
const router = Router();
router.use(verifyToken);

router.post('/', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), createDcrRules, validate, createDcr);
router.get('/', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), listMyDcr);
router.patch('/submit-day', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), submitDayRules, validate, submitDay);

// ASM+ (or admin/superadmin) read-only team view.
router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamDcr);

export default router;
