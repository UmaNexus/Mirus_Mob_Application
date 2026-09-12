import { body } from 'express-validator';

export const signOfferRules = [
  body('signatureBase64')
    .isString().withMessage('signatureBase64 is required')
    .notEmpty().withMessage('signatureBase64 is required')
    // Accept a raw base64 string or a PNG data URL.
    .matches(/^(data:image\/png;base64,)?[A-Za-z0-9+/=\r\n]+$/).withMessage('signature must be a base64 PNG')
];

export const setupPasswordRules = [
  body('token').isString().notEmpty().withMessage('token is required'),
  body('password')
    .isString()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter')
    .matches(/[0-9]/).withMessage('Password must contain a number')
];
