import { Router } from 'express';
import {
  getOnboardingStatus,
  savePersonal,
  saveFamily,
  saveContact,
  saveBank,
  saveEducation,
  saveExperience
} from '../controllers/onboardingController.js';
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { personalRules, familyRules, contactRules, bankRules, educationRules, experienceRules } from '../validators/onboardingValidators.js';
import validate from '../middleware/validate.js';

const router = Router();

// Self-service wizard for the authenticated user (typically a new employee).
router.use(verifyToken, authorizeRoles(['admin', 'hr', 'employee']));

router.get('/status', getOnboardingStatus);
router.patch('/personal', personalRules, validate, savePersonal);
router.patch('/family', familyRules, validate, saveFamily);
router.patch('/contact', contactRules, validate, saveContact);
router.patch('/bank', bankRules, validate, saveBank);
router.patch('/education', educationRules, validate, saveEducation);
router.patch('/experience', experienceRules, validate, saveExperience);

export default router;
