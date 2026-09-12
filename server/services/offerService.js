import OfferLetter from '../models/OfferLetter.js';

/** Offer statuses that can be flipped to accepted when HR issues credentials. */
const PROVISIONABLE_STATUSES = ['signed', 'sent', 'pending'];

/**
 * Mark an offer accepted (dashboard headcount + lifecycle). Idempotent when already accepted.
 */
export const acceptOfferForProvisioning = async (offer, { approvedBy } = {}) => {
  if (!offer) return null;
  if (offer.status === 'accepted') return offer;
  if (offer.status === 'declined') return null;

  const now = new Date();
  offer.status = 'accepted';
  offer.acceptedAt = now;
  if (approvedBy) {
    offer.approvedAt = now;
    offer.approvedBy = approvedBy;
  }
  offer.accessTokenHash = null;
  offer.accessTokenExpires = null;
  await offer.save();
  return offer;
};

/** Latest non-terminal offer for a candidate email (signed/sent/pending). */
export const findLatestProvisionableOffer = async (candidateEmail) => {
  const email = String(candidateEmail).toLowerCase().trim();
  return OfferLetter.findOne({
    candidateEmail: email,
    status: { $in: PROVISIONABLE_STATUSES }
  }).sort({ createdAt: -1 });
};

/**
 * Sync joining/offer dates on open offers when a soft-deleted candidate is re-staged.
 */
export const refreshOpenOfferDates = async (candidateEmail, { joiningDate, offerDate, fullName } = {}) => {
  const email = String(candidateEmail).toLowerCase().trim();
  const patch = {};
  if (joiningDate) patch.joiningDate = new Date(joiningDate);
  if (offerDate) patch.offerDate = new Date(offerDate);
  if (fullName) patch.fullName = String(fullName).trim();
  if (!Object.keys(patch).length) return;

  await OfferLetter.updateMany(
    { candidateEmail: email, status: { $in: PROVISIONABLE_STATUSES } },
    { $set: patch }
  );
};
