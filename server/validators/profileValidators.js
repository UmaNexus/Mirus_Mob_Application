import { body } from 'express-validator';

export const updateProfileRules = [
  body('firstName').optional().isString().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().isString().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('workEmail').optional().isEmail().withMessage('Work email must be valid').normalizeEmail({ gmail_remove_dots: false }),
  body('phone').optional().isString().trim().matches(/^[0-9+\-\s()]{7,15}$/).withMessage('Phone number is invalid')
];

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Za-z]/).withMessage('New password must contain a letter')
    .matches(/[0-9]/).withMessage('New password must contain a number')
];
