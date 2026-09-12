import { body } from 'express-validator';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'];

export const upsertWorkTypeRules = [
  body('date').isISO8601().withMessage('date must be a valid date'),
  body('type').isIn(['individual', 'joint', 'camp', 'meeting', 'sick', 'leave', 'fieldcall', 'jointcall'])
    .withMessage('Invalid work type'),
  body('details').optional().isObject().withMessage('details must be an object'),
  body('details.accompaniedBy').optional().isMongoId().withMessage('Invalid accompaniedBy id'),
  // Required only when type is 'sick' or 'leave' — these route into the
  // existing Leave module rather than being stored here (see WorkType.js).
  body('details.leaveType').if(body('type').isIn(['sick', 'leave'])).isIn(LEAVE_TYPES).withMessage('Invalid leaveType'),
  body('details.fromDate').if(body('type').isIn(['sick', 'leave'])).isISO8601().withMessage('details.fromDate is required'),
  body('details.toDate').if(body('type').isIn(['sick', 'leave'])).isISO8601().withMessage('details.toDate is required')
];
