import { body } from 'express-validator';

export const replaceManagerRules = [
  body('oldManagerId').isMongoId().withMessage('oldManagerId must be a valid id'),
  body('newManagerId').isMongoId().withMessage('newManagerId must be a valid id')
];
