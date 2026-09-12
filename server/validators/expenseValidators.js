import { body } from 'express-validator';

export const createExpenseRules = [
  body('category').isIn(['Travel', 'Food', 'Stay', 'Internet', 'Misc']).withMessage('Invalid category'),
  body('date').isISO8601().withMessage('date must be a valid date'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number (in rupees)'),
  body('stationType').optional({ nullable: true }).isIn(['Metro', 'Non-Metro']).withMessage('Invalid stationType'),
  body('from').optional().isString().trim(),
  body('to').optional().isString().trim(),
  body('modeOfTravel').optional().isString().trim()
];

export const decisionExpenseRules = [
  body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
  body('note').optional().isString().trim()
];
