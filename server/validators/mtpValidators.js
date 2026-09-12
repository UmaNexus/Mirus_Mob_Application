import { body } from 'express-validator';

export const upsertMtpRules = [
  body('month').matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('month must be in YYYY-MM format'),
  body('plannedVisits').optional().isArray().withMessage('plannedVisits must be an array'),
  body('plannedVisits.*.doctorId').optional().isMongoId().withMessage('Invalid doctorId in plannedVisits'),
  body('remarks').optional().isString().trim()
];

export const submitMtpRules = [
  body('remarks').optional().isString().trim()
];

export const decisionMtpRules = [
  body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
  body('note').optional().isString().trim()
];
