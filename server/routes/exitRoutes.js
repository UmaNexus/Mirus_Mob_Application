import { Router } from 'express';
import {
  initiateExit, listExits, getExit, updateExit, generateExitLetters, deleteExit
} from '../controllers/exitController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();
router.use(verifyToken, requirePermission(PERMISSIONS.EXIT_MANAGE));

router.post('/', initiateExit);
router.get('/', listExits);
router.get('/:id', getExit);
router.patch('/:id', updateExit);
router.post('/:id/letters', generateExitLetters);
router.delete('/:id', deleteExit);

export default router;
