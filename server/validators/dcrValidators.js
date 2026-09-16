import { body } from 'express-validator';

const DOCTOR_TYPES = ['individual', 'joint'];
// Meeting is NOT a DCR type — it is an internal activity tracked only via
// Today's Work Type, never a doctor call (see workTypeController.js).
const ACTIVITY_TYPES = ['camp'];

export const createDcrRules = [
  body('type').isIn(['individual', 'joint', 'missed', 'camp']).withMessage('type must be individual, joint, missed or camp'),
  body('doctorId').if(body('type').isIn(DOCTOR_TYPES)).isMongoId().withMessage('Valid doctorId is required'),
  body('activityName').if(body('type').isIn(ACTIVITY_TYPES)).notEmpty().withMessage('activityName is required for a camp'),
  body('venue').optional().isString().trim(),
  body('date').optional().isISO8601().withMessage('date must be a valid date'),
  body('accompaniedBy').if(body('type').equals('joint')).isMongoId().withMessage('accompaniedBy is required for a joint call'),
  body('productsDetailed').optional().isArray().withMessage('productsDetailed must be an array'),
  body('samplesGiven').optional().isArray().withMessage('samplesGiven must be an array'),
  body('feedback').optional().isString().trim(),
  body('visitTime').optional().isISO8601().withMessage('visitTime must be a valid date')
];

/** PATCH /api/dcr/:id — completing/editing a call already logged; doctorId/type are fixed and not accepted here. */
export const updateDcrRules = [
  body('productsDetailed').optional().isArray().withMessage('productsDetailed must be an array'),
  body('samplesGiven').optional().isArray().withMessage('samplesGiven must be an array'),
  body('feedback').optional().isString().trim(),
  body('activityName').optional().isString().trim(),
  body('venue').optional().isString().trim(),
  body('visitTime').optional().isISO8601().withMessage('visitTime must be a valid date'),
  // Both optional (never required — a missed call has no visit duration);
  // the authoritative endTime > startTime check runs in the controller
  // against the merged/persisted values, since either field may be sent
  // alone in a given PATCH while the other keeps its previously-saved value.
  body('startTime').optional({ nullable: true }).isISO8601().withMessage('startTime must be a valid date'),
  body('endTime').optional({ nullable: true }).isISO8601().withMessage('endTime must be a valid date'),
  body('status').optional().isIn(['pending', 'completed', 'missed']).withMessage('status must be pending, completed or missed')
];

export const submitDayRules = [
  body('date').isISO8601().withMessage('date is required (YYYY-MM-DD)')
];

export const markRemainingMissedRules = [
  body('date').isISO8601().withMessage('date is required (YYYY-MM-DD)')
];
