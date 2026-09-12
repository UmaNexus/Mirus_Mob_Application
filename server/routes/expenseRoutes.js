import { Router } from 'express';
import {
  createExpense, listMyExpenses, listTeamExpenses, listPendingApprovals, decideExpense, streamReceipt
} from '../controllers/expenseController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireFieldCapability } from '../middleware/fieldForceAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createExpenseRules, decisionExpenseRules } from '../validators/expenseValidators.js';
import validate from '../middleware/validate.js';
import { uploadExpenseReceipt } from '../middleware/uploadExpenseReceipt.js';

// Mounted at /api/expenses.
const router = Router();
router.use(verifyToken);

router.get('/', requireFieldCapability(PERMISSIONS.EXPENSE_SUBMIT, 'BDM'), listMyExpenses);
router.post('/', requireFieldCapability(PERMISSIONS.EXPENSE_SUBMIT, 'BDM'), uploadExpenseReceipt, createExpenseRules, validate, createExpense);
router.get('/:id/receipt', requireFieldCapability(PERMISSIONS.EXPENSE_SUBMIT, 'BDM'), streamReceipt);

router.get('/team', requireFieldCapability(PERMISSIONS.FIELDOPS_MONITOR, 'ASM'), listTeamExpenses);
router.get('/pending', requireFieldCapability(PERMISSIONS.EXPENSE_APPROVE, 'ASM'), listPendingApprovals);
router.patch('/:id/decision', requireFieldCapability(PERMISSIONS.EXPENSE_APPROVE, 'ASM'), decisionExpenseRules, validate, decideExpense);

export default router;
