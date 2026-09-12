import { body } from 'express-validator';

export const createOfferRules = [
  body('candidateEmail').isEmail().withMessage('Valid candidate email is required').normalizeEmail({ gmail_remove_dots: false }),
  body('fullName').isString().trim().notEmpty().withMessage('Full name is required'),
  body('position').isString().trim().notEmpty().withMessage('Position is required'),
  body('department').isString().trim().notEmpty().withMessage('Department is required'),
  body('joiningDate').isISO8601().withMessage('joiningDate must be a valid date'),
  body('offerDate').optional().isISO8601().withMessage('offerDate must be a valid date'),
  body('templateId').isMongoId().withMessage('Valid templateId is required'),
  body('annualCTC').isFloat({ gt: 0 }).withMessage('annualCTC must be a positive number (rupees)'),
  body('phone').optional().isString().trim(),
  body('city').optional().isString().trim(),
  body('location').optional().isString().trim(),
  body('acceptByDate').optional().isISO8601().withMessage('acceptByDate must be a valid date')
];

export const offerStatusRules = [
  body('status').isIn(['sent', 'pending', 'signed', 'accepted', 'declined']).withMessage('Invalid status')
];
