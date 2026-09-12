import { Router } from 'express';
import {
  createAsset, listAssets, listMyAssets, assignAsset, returnAsset, updateAsset, deleteAsset
} from '../controllers/assetController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken);

const manage = requirePermission(PERMISSIONS.ASSET_MANAGE);

router.get('/mine', listMyAssets); // employee self-service
router.get('/', manage, listAssets);
router.post('/', manage, createAsset);
router.post('/:id/assign', manage, assignAsset);
router.post('/:id/return', manage, returnAsset);
router.patch('/:id', manage, updateAsset);
router.delete('/:id', manage, deleteAsset);

export default router;
