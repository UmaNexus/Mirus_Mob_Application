import { body } from 'express-validator';

export const updateUserRules = [
  body('firstName').optional().isString().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().isString().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().isString().trim().matches(/^[0-9+\-\s()]{7,15}$/).withMessage('Phone number is invalid'),
  body('role').optional().isIn(['admin', 'hr', 'employee']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean').toBoolean(),
  body('designation').optional().isString().trim(),
  body('department').optional().isString().trim(),
  body('employeeId').optional().isString().trim().notEmpty().withMessage('Employee ID cannot be empty'),
  // Epic 8 employment + statutory fields.
  body('employmentType').optional().isIn(['Full-Time', 'Part-Time', 'Permanent', 'Probation', 'Contract', 'Intern']).withMessage('Invalid employment type'),
  // Work location (employeeDetails.workLocation): free text; an empty string or null clears it.
  body('workLocation').optional({ nullable: true }).isString().trim().isLength({ max: 120 }).withMessage('Work location is too long'),
  body('reportingManagerId').optional().isMongoId().withMessage('Invalid reporting manager id'),
  body('dateOfJoining').optional().isISO8601().withMessage('dateOfJoining must be a valid date'),
  body('esiNumber').optional().isString().trim(),
  body('professionalTaxNumber').optional().isString().trim(),
  // Job role (field-force identity): an existing JobRole id of the user's company, or null to clear.
  body('jobRoleId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid job role id')
];
