import { Router } from 'express';
import {
  createOffer,
  bulkCreateOffers,
  listOffers,
  getOffer,
  updateOfferStatus,
  approveOffer,
  generateAppointmentLetter,
  downloadOfferPdf,
  sendOfferEmail,
  regenerateOffer,
  deleteOffer,
  resendOffer,
  getMyOffer,
  downloadMyOfferPdf
} from '../controllers/offerController.js';
import { verifyToken, requirePermission } from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadXlsx } from '../middleware/uploadXlsx.js';
import { createOfferRules, offerStatusRules } from '../validators/offerValidators.js';
import validate from '../middleware/validate.js';

const router = Router();

// All offer routes require authentication.
router.use(verifyToken);

// Employee self-service — own offer only. Declared before the '/:id' routes so
// the literal '/mine' path matches first.
router.get('/mine', getMyOffer);
router.get('/mine/pdf', downloadMyOfferPdf);

// Management routes — granular RBAC (Epic R). Candidate-facing offer access is
// unauthenticated via magic link — see candidateRoutes.
router.post('/', requirePermission(PERMISSIONS.OFFER_MANAGE), createOfferRules, validate, createOffer);
router.post('/bulk', requirePermission(PERMISSIONS.OFFER_MANAGE), uploadXlsx, bulkCreateOffers);
router.get('/', requirePermission(PERMISSIONS.OFFER_READ), listOffers);
router.get('/:id', requirePermission(PERMISSIONS.OFFER_READ), getOffer);
router.get('/:id/pdf', requirePermission(PERMISSIONS.OFFER_READ), downloadOfferPdf);
router.patch('/:id/status', requirePermission(PERMISSIONS.OFFER_MANAGE), offerStatusRules, validate, updateOfferStatus);
router.post('/:id/approve', requirePermission(PERMISSIONS.OFFER_APPROVE), approveOffer);
router.post('/:id/appointment-letter', requirePermission(PERMISSIONS.OFFER_MANAGE), generateAppointmentLetter);
router.post('/:id/send', requirePermission(PERMISSIONS.OFFER_MANAGE), sendOfferEmail);
router.post('/:id/regenerate', requirePermission(PERMISSIONS.OFFER_MANAGE), regenerateOffer);
router.post('/:id/resend', requirePermission(PERMISSIONS.OFFER_MANAGE), resendOffer);
router.delete('/:id', requirePermission(PERMISSIONS.OFFER_MANAGE), deleteOffer);

export default router;
