import { body } from 'express-validator';

const commonRules = [
  body('stockistId').optional({ nullable: true }).isMongoId().withMessage('Invalid stockistId'),
  body('batchNumber').optional().isString().trim(),
  body('expiryDate').optional({ nullable: true }).isISO8601().withMessage('expiryDate must be a valid date'),
  body('quantity').optional().isInt({ min: 0 }).withMessage('quantity must be a non-negative integer'),
  body('value').optional().isFloat({ min: 0 }).withMessage('value must be a non-negative number (in rupees)')
];

export const createSecondarySaleRules = [
  body('productName').isString().trim().notEmpty().withMessage('productName is required'),
  ...commonRules
];

export const updateSecondarySaleRules = [
  body('productName').optional().isString().trim().notEmpty().withMessage('productName cannot be empty'),
  ...commonRules
];
