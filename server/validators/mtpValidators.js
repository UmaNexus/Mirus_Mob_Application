import { body } from 'express-validator';

const plannedVisitsRules = [
  body('plannedVisits').optional().isArray().withMessage('plannedVisits must be an array'),
  body('plannedVisits.*.doctorId').isMongoId().withMessage('Invalid doctorId in plannedVisits'),
  body('plannedVisits.*.date').isISO8601().withMessage('Invalid date in plannedVisits')
];

/** POST /api/mtp — always creates a new tour submission; month is required. */
export const createMtpRules = [
  body('month').matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('month must be in YYYY-MM format'),
  ...plannedVisitsRules,
  body('remarks').optional().isString().trim()
];

/** PATCH /api/mtp/:id — edits an existing (still-editable) tour; month is fixed by the record, not sent. */
export const updateMtpRules = [
  ...plannedVisitsRules,
  body('remarks').optional().isString().trim()
];

export const submitMtpRules = [
  body('remarks').optional().isString().trim()
];

export const decisionMtpRules = [
  body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
  body('note').optional().isString().trim()
];
