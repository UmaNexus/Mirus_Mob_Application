import { Router } from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldTier } from '../middleware/fieldForceAuth.js';
import { listFieldForceTeam } from '../controllers/fieldForceController.js';

// Mounted at /api/field-force. Domain 1 scaffolding: one read-only endpoint
// exercising authentication + tier gating + reporting-hierarchy scoping +
// tenant isolation end-to-end. Later domains (Doctor, DCR, MTP, ...) mount
// their own routers alongside this one and reuse the same middleware.
const router = Router();
router.use(verifyToken);

// BDM is the lowest tier — any tiered field-force user, or admin/superadmin
// via company-wide access, may call this; scoping happens inside the controller.
router.get('/team', requireFieldTier('BDM'), listFieldForceTeam);

export default router;
