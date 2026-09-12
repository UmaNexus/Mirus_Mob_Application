import { Router } from 'express';
import { getHubOverview } from '../controllers/selfServiceController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = Router();
router.use(verifyToken);

router.get('/overview', getHubOverview);

export default router;
