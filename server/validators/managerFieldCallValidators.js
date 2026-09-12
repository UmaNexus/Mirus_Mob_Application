import { body } from 'express-validator';

export const createManagerFieldCallRules = [
  body('visitType').isIn(['Doctor', 'Chemist', 'Hospital']).withMessage('Invalid visitType'),
  body('reason').isIn(['No BDM assigned', 'BDM on leave', 'BDM vacancy', 'Emergency visit']).withMessage('Invalid reason'),
  body('area').optional().isString().trim(),
  body('doctorId').optional({ nullable: true }).isMongoId().withMessage('Invalid doctorId'),
  body('contactName').optional().isString().trim(),
  body('speciality').optional().isString().trim(),
  body('productsDetailed').optional().isArray().withMessage('productsDetailed must be an array'),
  body('samplesGiven').optional().isArray().withMessage('samplesGiven must be an array'),
  body('feedback').optional().isString().trim(),
  body('loggedAt').optional().isISO8601().withMessage('loggedAt must be a valid date'),
  body().custom((_, { req }) => {
    if (!req.body.doctorId && !String(req.body.contactName || '').trim()) {
      throw new Error('Either doctorId or contactName is required');
    }
    return true;
  })
];
