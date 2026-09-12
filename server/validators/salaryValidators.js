import { body } from 'express-validator';

const CALC_TYPES = ['fixed', 'percentage_of_ctc', 'percentage_of_basic', 'balance_of_ctc'];

const structureRules = (field) => [
  body(field).optional().isArray().withMessage(`${field} must be an array`),
  body(`${field}.*.key`).optional().isString().trim().notEmpty().withMessage('Field key is required'),
  body(`${field}.*.label`).optional().isString().trim().notEmpty().withMessage('Field label is required'),
  body(`${field}.*.calculationType`).optional().isIn(CALC_TYPES).withMessage('Invalid calculationType'),
  body(`${field}.*.valueFactor`).optional().isNumeric().withMessage('valueFactor must be numeric')
];

export const createTemplateRules = [
  body('name').isString().trim().notEmpty().withMessage('Template name is required'),
  body('description').optional().isString().trim(),
  ...structureRules('earningsStructure'),
  ...structureRules('deductionsStructure')
];

export const updateTemplateRules = [
  body('name').optional().isString().trim().notEmpty(),
  body('description').optional().isString().trim(),
  body('isActive').optional().isBoolean().toBoolean(),
  ...structureRules('earningsStructure'),
  ...structureRules('deductionsStructure')
];

export const assignSalaryRules = [
  body('userId').isMongoId().withMessage('Valid userId is required'),
  body('templateId').isMongoId().withMessage('Valid templateId is required'),
  body('annualCTC').isFloat({ gt: 0 }).withMessage('annualCTC must be a positive number (in rupees)')
];

export const generatePayslipRules = [
  body('month').isInt({ min: 1, max: 12 }).withMessage('month must be 1-12').toInt(),
  body('year').isInt({ min: 2000, max: 2100 }).withMessage('year is invalid').toInt(),
  body('employeeIds').optional().isArray().withMessage('employeeIds must be an array'),
  body('notify').optional().isBoolean().toBoolean(),
  // Epic 16 — statutory run (PF/ESI/PT/TDS + LOP).
  body('applyStatutory').optional().isBoolean().toBoolean(),
  body('workingDays').optional().isInt({ min: 1, max: 31 }).toInt()
];
