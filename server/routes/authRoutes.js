import { Router } from 'express';
import { login, logout, getCurrentUser } from '../controllers/authController.js';
import { loginRules } from '../validators/authValidators.js';
import validate from '../middleware/validate.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/login', loginRules, validate, login);
router.post('/logout', logout);
router.get('/me', verifyToken, getCurrentUser);

export default router;
