import { body } from 'express-validator';

export const loginRules = [
  body('companySlug')
    .isString().withMessage('Company code is required')
    .trim().notEmpty().withMessage('Company code is required'),
  // Accept email (legacy) and/or identifier (email or Employee ID).
  body('password')
    .isString().withMessage('Password is required')
    .notEmpty().withMessage('Password is required'),
  body().custom((_, { req }) => {
    const raw = req.body.identifier ?? req.body.email;
    const identifier = String(raw ?? '').trim();
    if (!identifier) {
      throw new Error('Email or Employee ID is required');
    }
    req.body.identifier = identifier;
    return true;
  })
];
