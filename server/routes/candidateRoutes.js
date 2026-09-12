import { Router } from 'express';
import {
  getOfferByToken,
  downloadOfferPdfByToken,
  signOffer,
  setupPassword
} from '../controllers/candidateController.js';
import { signOfferRules, setupPasswordRules } from '../validators/candidateValidators.js';
import validate from '../middleware/validate.js';

// Public, unauthenticated routes. Access is gated by single-use magic-link
// tokens rather than a session (Epic 5).
const router = Router();

router.get('/offer/:token', getOfferByToken);
router.get('/offer/:token/pdf', downloadOfferPdfByToken);
router.post('/offer/:token/sign', signOfferRules, validate, signOffer);
router.post('/setup-password', setupPasswordRules, validate, setupPassword);

export default router;
