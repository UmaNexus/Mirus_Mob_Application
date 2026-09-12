import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import OfferLetter from '../models/OfferLetter.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { hashToken } from '../utils/tokens.js';
import { bakeSignatureOnOffer } from '../services/pdfService.js';
import { formatINR } from '../utils/money.js';
import { setTenant } from '../utils/tenantContext.js';

/**
 * Look up a live (non-expired) offer by its raw magic-link token. The token
 * itself is the security boundary for this unauthenticated route; once found,
 * we pin the request's tenant context to the offer's company so every
 * downstream query (populate, user lookup, provisioning) is properly scoped.
 */
const findOfferByToken = async (rawToken) => {
  const offer = await OfferLetter.findOne({
    accessTokenHash: hashToken(rawToken),
    accessTokenExpires: { $gt: new Date() }
  });
  if (!offer) throw new ApiError(401, 'This offer link is invalid or has expired');
  setTenant({ companyId: offer.companyId, role: 'employee' });
  await offer.populate({ path: 'salaryAssignmentId' });
  return offer;
};

const presentBreakdown = (assignment) => {
  if (!assignment) return null;
  const b = assignment.frozenMonthlyBreakdown;
  const withDisplay = (items) => items.map((i) => ({ ...i.toObject?.() ?? i, display: formatINR(i.monthlyAmount) }));
  return {
    annualCTC: assignment.annualCTC,
    annualCTCDisplay: formatINR(assignment.annualCTC),
    earnings: withDisplay(b.earnings),
    deductions: withDisplay(b.deductions),
    grossEarnings: b.grossEarnings,
    grossEarningsDisplay: formatINR(b.grossEarnings),
    totalDeductions: b.totalDeductions,
    netTakeHome: b.netTakeHome,
    netTakeHomeDisplay: formatINR(b.netTakeHome)
  };
};

/**
 * GET /api/candidate/offer/:token
 * US 5.1 / 5.2 — open the offer portal via magic link and inspect the
 * compensation breakdown without authenticating.
 */
export const getOfferByToken = asyncHandler(async (req, res) => {
  const offer = await findOfferByToken(req.params.token);
  res.status(200).json({
    success: true,
    offer: {
      id: offer._id,
      fullName: offer.fullName,
      candidateEmail: offer.candidateEmail,
      position: offer.position,
      department: offer.department,
      offerDate: offer.offerDate,
      joiningDate: offer.joiningDate,
      status: offer.status,
      pdfFileUrl: offer.pdfFileUrl,
      signedPdfFileUrl: offer.signedPdfFileUrl
    },
    compensation: presentBreakdown(offer.salaryAssignmentId)
  });
});

/**
 * GET /api/candidate/offer/:token/pdf — stream the offer PDF for the magic-link portal.
 */
export const downloadOfferPdfByToken = asyncHandler(async (req, res) => {
  const offer = await findOfferByToken(req.params.token);
  const rel = offer.signedPdfFileUrl || offer.pdfFileUrl;
  if (!rel) throw new ApiError(404, 'Offer PDF is not available');
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Offer PDF is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="offer-letter.pdf"`);
  fs.createReadStream(abs).pipe(res);
});

/**
 * POST /api/candidate/offer/:token/sign
 * US 5.3 — e-sign the offer by submitting a drawn signature (base64 PNG).
 * Bakes the signature into the PDF, records a cryptographic verification hash,
 * and moves the offer to "signed" — awaiting HR/Admin approval. Login
 * credentials are NOT issued here; provisioning happens only after approval
 * (see POST /api/offers/:id/approve, US 5.4).
 * Body: { signatureBase64 }
 */
export const signOffer = asyncHandler(async (req, res) => {
  const { signatureBase64 } = req.body;
  const offer = await findOfferByToken(req.params.token);

  // Signing is only valid on an outstanding offer; block replays / re-signs.
  if (offer.status === 'signed') throw new ApiError(409, 'This offer has already been signed and is awaiting approval');
  if (offer.status === 'accepted') throw new ApiError(409, 'This offer has already been accepted');
  if (offer.status === 'declined') throw new ApiError(409, 'This offer was declined');

  const signedAt = new Date();
  // Cryptographic tamper-evidence hash of the signature + timestamp (CLAUDE.md
  // E-Signature workflow).
  const verificationToken = crypto.createHash('sha256')
    .update(`${signatureBase64}|${signedAt.toISOString()}`).digest('hex');

  const signedPdfFileUrl = await bakeSignatureOnOffer(offer.pdfFileUrl, signatureBase64, {
    name: offer.fullName,
    signedAt,
    acceptancePlacement: offer.acceptancePlacement
  });

  // Awaiting approval — credentials are withheld until HR/Admin approves.
  offer.status = 'signed';
  offer.signedPdfFileUrl = signedPdfFileUrl;
  offer.digitalSignature = { signatureBase64, signedAt, ipAddress: req.ip, verificationToken };
  await offer.save();

  res.status(200).json({
    success: true,
    message: 'Offer signed — awaiting HR approval. You will receive your login credentials by email once approved.',
    status: offer.status,
    signedPdfFileUrl,
    verificationToken
  });
});

/**
 * POST /api/candidate/setup-password
 * US 5.4 — register account credentials using the emailed setup token, which
 * activates the employee account.
 * Body: { token, password }
 */
export const setupPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    'passwordSetup.tokenHash': hashToken(token),
    'passwordSetup.expiresAt': { $gt: new Date() }
  });
  if (!user) throw new ApiError(401, 'This setup link is invalid or has expired');
  if (user.deletedAt) {
    throw new ApiError(403, 'This account has been deleted. Contact your administrator.');
  }

  user.password = password; // hashed by pre-save hook
  user.isActive = true;
  user.passwordSetup = { tokenHash: null, expiresAt: null };
  await user.save();

  res.status(200).json({ success: true, message: 'Password set. You can now log in.' });
});
