import { Router } from 'express';
import { listMyStockists, createStockist, updateStockist, listTeamStockists } from '../controllers/stockistController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createStockistRules, updateStockistRules } from '../validators/stockistValidators.js';
import validate from '../middleware/validate.js';

// Mounted at /api/stockists.
const router = Router();
router.use(verifyToken);

router.get('/', requireFieldCapability(PERMISSIONS.STOCKIST_MANAGE, 'BDM'), listMyStockists);
router.post('/', requireFieldCapability(PERMISSIONS.STOCKIST_MANAGE, 'BDM'), createStockistRules, validate, createStockist);
router.patch('/:id', requireFieldCapability(PERMISSIONS.STOCKIST_MANAGE, 'BDM'), updateStockistRules, validate, updateStockist);

router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamStockists);

export default router;
