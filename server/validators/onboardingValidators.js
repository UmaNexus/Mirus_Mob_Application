import { body } from 'express-validator';
import { DOCUMENT_TYPES } from '../models/User.js';

export const personalRules = [
  body('firstName').optional({ values: 'falsy' }).isString().trim().notEmpty(),
  body('lastName').optional({ values: 'falsy' }).isString().trim().notEmpty(),
  body('dateOfBirth').optional({ values: 'falsy' }).isISO8601().withMessage('dateOfBirth must be a valid date'),
  body('gender').optional({ values: 'falsy' }).isIn(['Male', 'Female', 'Non-binary', 'Prefer not to say']),
  // Empty string from the wizard must not fail enum checks (blood group is optional).
  body('bloodGroup').optional({ values: 'falsy' }).isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  body('maritalStatus').optional({ values: 'falsy' }).isIn(['Single', 'Married', 'Divorced', 'Widowed'])
];

export const familyRules = [
  body('familyDetails').isArray().withMessage('familyDetails must be an array'),
  body('familyDetails.*.name').isString().trim().notEmpty().withMessage('Family member name is required'),
  body('familyDetails.*.relationship').isIn(['Father', 'Mother', 'Spouse', 'Sibling', 'Child', 'Other']).withMessage('Invalid relationship')
];

const addressRules = (prefix) => [
  body(`${prefix}.street`).isString().trim().notEmpty().withMessage('Street is required'),
  body(`${prefix}.city`).isString().trim().notEmpty().withMessage('City is required'),
  body(`${prefix}.state`).isString().trim().notEmpty().withMessage('State is required'),
  body(`${prefix}.zipCode`).isString().trim().notEmpty().withMessage('Zip code is required')
];

export const contactRules = [
  body('personalMobile').isString().trim().matches(/^[0-9+\-\s()]{7,15}$/).withMessage('Valid mobile is required'),
  body('emergencyContactName').isString().trim().notEmpty().withMessage('Emergency contact name is required'),
  body('emergencyContactRelation').isString().trim().notEmpty().withMessage('Emergency contact relation is required'),
  body('emergencyContactPhone').isString().trim().matches(/^[0-9+\-\s()]{7,15}$/).withMessage('Valid emergency phone is required'),
  ...addressRules('presentAddress'),
  body('sameAsPresent').optional().isBoolean().toBoolean()
];

export const bankRules = [
  body('accountHolderName').isString().trim().notEmpty().withMessage('Account holder name is required'),
  body('accountNumber').isString().trim().matches(/^[0-9]{6,20}$/).withMessage('Account number is invalid'),
  body('bankName').isString().trim().notEmpty().withMessage('Bank name is required'),
  body('ifscCode').isString().trim().matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/).withMessage('IFSC code is invalid'),
  body('panNumber').optional().isString().trim().matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/).withMessage('PAN is invalid')
];

export const documentUploadRules = [
  body('documentType').isIn(DOCUMENT_TYPES).withMessage('Invalid document type'),
  body('documentName').optional().isString().trim(),
  body('documentNumber').isString().trim().notEmpty().withMessage('Document reference number is required')
];

export const verifyDocumentRules = [
  body('status').isIn(['Pending', 'Verified', 'Rejected']).withMessage('Invalid verification status')
];

// Epic 9 — structured education / experience / references.
export const educationRules = [
  body('educationHistory').isArray().withMessage('educationHistory must be an array'),
  body('educationHistory.*.level').isIn(['SSC', 'HSC', 'Diploma', 'Graduate', 'PostGraduate', 'Doctorate', 'Professional', 'Other']).withMessage('Invalid education level'),
  body('educationHistory.*.institution').isString().trim().notEmpty().withMessage('Institution is required'),
  body('educationHistory.*.yearOfPassing').optional().isInt({ min: 1950, max: 2100 }).withMessage('Invalid year of passing')
];

export const experienceRules = [
  body('notApplicable').optional().isBoolean().toBoolean(),
  body('experienceHistory').optional().isArray().withMessage('experienceHistory must be an array'),
  // Document / employer field rules are enforced in the controller so the
  // notApplicable (fresher) path can skip them cleanly.
  body('references').optional().isArray().withMessage('references must be an array'),
  body('references.*.name').optional().isString().trim().notEmpty().withMessage('Reference name is required')
];
