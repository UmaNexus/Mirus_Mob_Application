import { body } from 'express-validator';

export const createStockistRules = [
  body('name').isString().trim().notEmpty().withMessage('Stockist name is required'),
  body('area').optional().isString().trim(),
  body('lastOrderAmount').optional().isFloat({ min: 0 }).withMessage('lastOrderAmount must be a non-negative number (in rupees)'),
  body('lastOrderDate').optional({ nullable: true }).isISO8601().withMessage('lastOrderDate must be a valid date'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status')
];

export const updateStockistRules = [
  body('name').optional().isString().trim().notEmpty().withMessage('Stockist name cannot be empty'),
  body('area').optional().isString().trim(),
  body('lastOrderAmount').optional().isFloat({ min: 0 }).withMessage('lastOrderAmount must be a non-negative number (in rupees)'),
  body('lastOrderDate').optional({ nullable: true }).isISO8601().withMessage('lastOrderDate must be a valid date'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status')
];
