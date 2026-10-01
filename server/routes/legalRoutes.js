import express from 'express';
import {
  getPrivacyPolicyHtml,
  getAccountDeletionHtml,
  getTermsHtml,
  getPrivacyPolicyJson
} from '../controllers/legalController.js';

const router = express.Router();

// Public web endpoints (HTML) - required by Google Play Console
router.get('/privacy-policy', getPrivacyPolicyHtml);
router.get('/account-deletion', getAccountDeletionHtml);
router.get('/data-deletion', getAccountDeletionHtml);
router.get('/terms', getTermsHtml);
router.get('/terms-and-conditions', getTermsHtml);

// API endpoint (JSON)
router.get('/api/privacy-policy', getPrivacyPolicyJson);

export default router;
