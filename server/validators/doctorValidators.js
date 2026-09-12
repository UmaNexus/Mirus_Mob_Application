import { body } from 'express-validator';

const commonRules = [
  body('speciality').optional({ nullable: true }).isString().trim(),
  body('area').optional({ nullable: true }).isString().trim(),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('dob').optional({ nullable: true }).isISO8601().withMessage('dob must be a valid date'),
  body('anniversaryDate').optional({ nullable: true }).isISO8601().withMessage('anniversaryDate must be a valid date'),
  body('assignedTo').optional({ nullable: true }).isMongoId().withMessage('Invalid assignedTo user id')
];

export const createDoctorRules = [
  body('name').isString().trim().notEmpty().withMessage('Doctor name is required'),
  ...commonRules
];

export const updateDoctorRules = [
  body('name').optional().isString().trim().notEmpty().withMessage('Doctor name cannot be empty'),
  ...commonRules
];
