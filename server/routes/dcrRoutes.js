import { Router } from 'express';
import { createDcr, updateDcr, listMyDcr, listTeamDcr, submitDay, markRemainingMissed } from '../controllers/dcrController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createDcrRules, updateDcrRules, submitDayRules, markRemainingMissedRules } from '../validators/dcrValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/dcr. Literal-path routes (submit-day, mark-remaining-missed,
// team) are declared before the /:id param route so they are never swallowed
// by it.
const router = Router();
router.use(verifyToken);

router.post('/', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), createDcrRules, validate, createDcr);
router.get('/', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), listMyDcr);
router.patch('/submit-day', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), submitDayRules, validate, submitDay);
router.patch('/mark-remaining-missed', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), markRemainingMissedRules, validate, markRemainingMissed);

// ASM+ (or admin/superadmin) read-only team view.
router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamDcr);

router.patch('/:id', requireFieldCapability(PERMISSIONS.DCR_SUBMIT, 'BDM'), updateDcrRules, validate, updateDcr);

export default router;
