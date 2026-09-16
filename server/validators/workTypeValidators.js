import { body } from 'express-validator';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'];

export const upsertWorkTypeRules = [
  body('date').isISO8601().withMessage('date must be a valid date'),
  body('type').isIn(['individual', 'joint', 'camp', 'meeting', 'sick', 'leave', 'fieldcall', 'jointcall'])
    .withMessage('Invalid work type'),
  body('details').optional().isObject().withMessage('details must be an object'),
  body('details.accompaniedBy').optional().isMongoId().withMessage('Invalid accompaniedBy id'),
  // A meeting's participant is either the literal string "team" (Team
  // Meeting — not a real user) or a manager's user id (Manager Meeting).
  body('details.meetingWith').if(body('type').equals('meeting')).custom((value) => {
    if (value === 'team' || /^[0-9a-fA-F]{24}$/.test(String(value))) return true;
    throw new Error('details.meetingWith must be "team" or a valid manager id');
  }),
  // Required only when type is 'sick' or 'leave' — these route into the
  // existing Leave module rather than being stored here (see WorkType.js).
  body('details.leaveType').if(body('type').isIn(['sick', 'leave'])).isIn(LEAVE_TYPES).withMessage('Invalid leaveType'),
  body('details.fromDate').if(body('type').isIn(['sick', 'leave'])).isISO8601().withMessage('details.fromDate is required'),
  body('details.toDate').if(body('type').isIn(['sick', 'leave'])).isISO8601().withMessage('details.toDate is required')
];
