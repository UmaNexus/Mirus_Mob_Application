import { body } from 'express-validator';
import { FIELD_TIERS } from '../config/fieldForce.js';

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
  body('workLocation').optional().isString().trim(),
  body('reportingManagerId').optional().isMongoId().withMessage('Invalid reporting manager id'),
  body('dateOfJoining').optional().isISO8601().withMessage('dateOfJoining must be a valid date'),
  body('esiNumber').optional().isString().trim(),
  body('professionalTaxNumber').optional().isString().trim(),
  // Mobile field-force hierarchy (separate from `role`).
  body('fieldForceTier').optional({ nullable: true }).isIn(FIELD_TIERS).withMessage('Invalid field-force tier'),
  body('fieldForceTerritory').optional({ nullable: true }).isString().trim()
];
