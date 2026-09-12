import { Router } from 'express';
import { upsertWorkType, listMyWorkType, listTeamWorkType } from '../controllers/workTypeController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { upsertWorkTypeRules } from '../validators/workTypeValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/work-type.
const router = Router();
router.use(verifyToken);

router.post('/', requireFieldCapability(PERMISSIONS.WORKTYPE_LOG, 'BDM'), upsertWorkTypeRules, validate, upsertWorkType);
router.get('/', requireFieldCapability(PERMISSIONS.WORKTYPE_LOG, 'BDM'), listMyWorkType);
router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamWorkType);

export default router;
