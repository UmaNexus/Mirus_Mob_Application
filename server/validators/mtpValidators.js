import { body } from 'express-validator';

// A planned visit is a date + Area/Location — doctors are no longer part of
// MTP (see the model doc on PlannedVisitSchema); doctor-level planning
// happens later via Today's Work Type/DCR.
const plannedVisitsRules = [
  body('plannedVisits').optional().isArray().withMessage('plannedVisits must be an array'),
  body('plannedVisits.*.area').notEmpty().withMessage('Each planned visit needs an area'),
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

// approverId is required — the BDM must explicitly select who should
// receive the MTP; there is no default/fallback approver.
export const submitMtpRules = [
  body('approverId').isMongoId().withMessage('Please select an approver before submitting the MTP'),
  body('remarks').optional().isString().trim()
];

export const decisionMtpRules = [
  body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
  body('note').optional().isString().trim()
];
