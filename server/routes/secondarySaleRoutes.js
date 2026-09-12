import { Router } from 'express';
import {
  listMySecondarySales, listExpiryAlerts, createSecondarySale, updateSecondarySale, listTeamSecondarySales
} from '../controllers/secondarySaleController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createSecondarySaleRules, updateSecondarySaleRules } from '../validators/secondarySaleValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/secondary-sales.
const router = Router();
router.use(verifyToken);

router.get('/', requireFieldCapability(PERMISSIONS.STOCKIST_MANAGE, 'BDM'), listMySecondarySales);
router.get('/alerts', requireFieldCapability(PERMISSIONS.STOCKIST_MANAGE, 'BDM'), listExpiryAlerts);
router.post('/', requireFieldCapability(PERMISSIONS.STOCKIST_MANAGE, 'BDM'), createSecondarySaleRules, validate, createSecondarySale);
router.patch('/:id', requireFieldCapability(PERMISSIONS.STOCKIST_MANAGE, 'BDM'), updateSecondarySaleRules, validate, updateSecondarySale);

router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamSecondarySales);

export default router;
