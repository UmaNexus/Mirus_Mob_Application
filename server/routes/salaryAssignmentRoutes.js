import { Router } from 'express';
import { assignSalary, getAssignmentByUser } from '../controllers/salaryAssignmentController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { assignSalaryRules } from '../validators/salaryValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken, requirePermission(PERMISSIONS.SALARY_ASSIGN));

router.post('/', assignSalaryRules, validate, assignSalary);
router.get('/user/:userId', getAssignmentByUser);

export default router;
