import { Router } from 'express';
import { getCompany, updateCompany, uploadCompanyBrandingAsset, getCompanyBrandingAsset } from '../controllers/companyController.js';
import { verifyToken, authorizeRoles, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadCompanyAsset } from '../middleware/uploadCompanyAsset.js';

const router = Router();
router.use(verifyToken);

// Any manager may read the config; only company:manage (admin) may change it.
router.get('/', authorizeRoles(['admin', 'hr']), getCompany);
router.put('/', requirePermission(PERMISSIONS.COMPANY_MANAGE), updateCompany);
router.get('/asset/:kind', authorizeRoles(['admin', 'hr']), getCompanyBrandingAsset);
router.post('/asset/:kind', requirePermission(PERMISSIONS.COMPANY_MANAGE), uploadCompanyAsset, uploadCompanyBrandingAsset);

export default router;
