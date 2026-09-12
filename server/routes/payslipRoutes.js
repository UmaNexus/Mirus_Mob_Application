import { Router } from 'express';
import {
  generatePayslips,
  listPayslips,
  listMyPayslips,
  downloadPayslipPdf
} from '../controllers/payslipController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { generatePayslipRules } from '../validators/salaryValidators.js';
import validate from '../middleware/validate.js';

const router = Router();
router.use(verifyToken);

// Employee self-service (US 7.2 / 7.3) — own slips only.
router.get('/mine', listMyPayslips);

// Authorized download — ownership/role enforced inside the controller.
router.get('/:id/pdf', downloadPayslipPdf);

// Management — granular RBAC (Epic R).
router.post('/generate', requirePermission(PERMISSIONS.PAYROLL_RUN), generatePayslipRules, validate, generatePayslips);
router.get('/', requirePermission(PERMISSIONS.PAYROLL_READ), listPayslips);

export default router;
