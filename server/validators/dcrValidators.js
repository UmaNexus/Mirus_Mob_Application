import { body } from 'express-validator';

export const createDcrRules = [
  body('type').isIn(['individual', 'joint', 'missed']).withMessage('type must be individual, joint or missed'),
  body('doctorId').isMongoId().withMessage('Valid doctorId is required'),
  body('date').optional().isISO8601().withMessage('date must be a valid date'),
  body('accompaniedBy').if(body('type').equals('joint')).isMongoId().withMessage('accompaniedBy is required for a joint call'),
  body('productsDetailed').optional().isArray().withMessage('productsDetailed must be an array'),
  body('samplesGiven').optional().isArray().withMessage('samplesGiven must be an array'),
  body('feedback').optional().isString().trim(),
  body('visitTime').optional().isISO8601().withMessage('visitTime must be a valid date')
];

export const submitDayRules = [
  body('date').isISO8601().withMessage('date is required (YYYY-MM-DD)')
];
