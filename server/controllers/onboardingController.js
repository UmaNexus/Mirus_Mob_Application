import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const STAGES = ['personal', 'family', 'contact', 'experience', 'bank', 'completed'];

// Advance the stored stage forward only (never regress on a re-save).
const advanceStage = (user, justCompleted) => {
  const next = STAGES[STAGES.indexOf(justCompleted) + 1] || 'completed';
  if (STAGES.indexOf(next) > STAGES.indexOf(user.onboardingStage)) {
    user.onboardingStage = next;
  }
};

const loadSelf = async (req) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

const experienceComplete = (user) =>
  Boolean(user.previousEmployerNotApplicable) || (user.experienceHistory || []).length > 0;

/**
 * GET /api/onboarding/status — US 6.3
 * Returns the wizard stage plus per-section completeness and a document summary.
 */
export const getOnboardingStatus = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  const docs = user.uploadedDocuments || [];
  res.status(200).json({
    success: true,
    stage: user.onboardingStage,
    sections: {
      personal: Boolean(user.personalDetails?.firstName && user.personalDetails?.dateOfBirth),
      family: (user.familyDetails || []).length > 0,
      contact: user.contactInfo?.personalMobile && user.contactInfo.personalMobile !== '0000000000',
      experience: experienceComplete(user),
      bank: Boolean(user.employeeDetails?.bankDetails?.accountNumber)
    },
    previousEmployerNotApplicable: Boolean(user.previousEmployerNotApplicable),
    experienceHistory: user.experienceHistory || [],
    documents: {
      total: docs.length,
      pending: docs.filter((d) => d.verificationStatus === 'Pending').length,
      verified: docs.filter((d) => d.verificationStatus === 'Verified').length,
      rejected: docs.filter((d) => d.verificationStatus === 'Rejected').length
    }
  });
});

/** PATCH /api/onboarding/personal — wizard step 1. */
export const savePersonal = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  user.personalDetails = user.personalDetails || {};
  const required = ['firstName', 'lastName', 'dateOfBirth', 'gender'];
  for (const f of required) {
    const v = req.body[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      user.personalDetails[f] = f === 'dateOfBirth' ? v : String(v).trim();
    }
  }
  if (req.body.maritalStatus !== undefined && String(req.body.maritalStatus).trim() !== '') {
    user.personalDetails.maritalStatus = String(req.body.maritalStatus).trim();
  }
  // Optional enum — blank means clear / leave unset (never persist '').
  if (Object.prototype.hasOwnProperty.call(req.body, 'bloodGroup')) {
    const bg = req.body.bloodGroup;
    if (bg === undefined || bg === null || String(bg).trim() === '') {
      delete user.personalDetails.bloodGroup;
      user.markModified('personalDetails');
    } else {
      user.personalDetails.bloodGroup = String(bg).trim();
    }
  }
  advanceStage(user, 'personal');
  await user.save();
  res.status(200).json({ success: true, message: 'Personal details saved', stage: user.onboardingStage, personalDetails: user.personalDetails });
});

/** PATCH /api/onboarding/family — wizard step 2 (replaces the family list). */
export const saveFamily = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  if (!Array.isArray(req.body.familyDetails)) throw new ApiError(400, 'familyDetails must be an array');
  user.familyDetails = req.body.familyDetails;
  advanceStage(user, 'family');
  await user.save();
  res.status(200).json({ success: true, message: 'Family details saved', stage: user.onboardingStage, familyDetails: user.familyDetails });
});

/** PATCH /api/onboarding/contact — wizard step 3. */
export const saveContact = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  const c = req.body;
  ['personalMobile', 'workMobile', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone']
    .forEach((f) => { if (c[f] !== undefined) user.contactInfo[f] = c[f]; });
  if (c.presentAddress) user.contactInfo.presentAddress = c.presentAddress;
  // US 7 wireframe: "Permanent same as present" checkbox.
  user.contactInfo.permanentAddress = c.sameAsPresent ? c.presentAddress : (c.permanentAddress || user.contactInfo.permanentAddress);
  advanceStage(user, 'contact');
  await user.save();
  res.status(200).json({ success: true, message: 'Contact details saved', stage: user.onboardingStage, contactInfo: user.contactInfo });
});

/**
 * PATCH /api/onboarding/education — Epic 9.
 * Replaces the caller's structured education history (SSC/12th/degree/PG/…).
 * Independent of the linear wizard stage machine.
 */
export const saveEducation = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  if (!Array.isArray(req.body.educationHistory)) throw new ApiError(400, 'educationHistory must be an array');
  user.educationHistory = req.body.educationHistory;
  await user.save();
  res.status(200).json({ success: true, message: 'Education details saved', educationHistory: user.educationHistory });
});

/**
 * PATCH /api/onboarding/experience — wizard step 4 (previous employer).
 * Supports notApplicable (fresher) or one+ employer rows with offer letter,
 * 3 payslips, and service letter / FNF.
 */
export const saveExperience = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  const notApplicable = Boolean(req.body.notApplicable);

  if (notApplicable) {
    user.previousEmployerNotApplicable = true;
    user.experienceHistory = [];
  } else {
    if (!Array.isArray(req.body.experienceHistory) || req.body.experienceHistory.length === 0) {
      throw new ApiError(400, 'Add at least one previous employer, or select Not Applicable');
    }
    for (const row of req.body.experienceHistory) {
      if (!row.employerName?.trim()) throw new ApiError(400, 'Employer name is required');
      if (!row.offerLetterFileUrl) throw new ApiError(400, 'Previous employer offer letter is required');
      const payslips = Array.isArray(row.payslipFileUrls) ? row.payslipFileUrls.filter(Boolean) : [];
      if (payslips.length < 3) throw new ApiError(400, 'Upload 3 previous employer payslips');
      if (!row.serviceOrFnfFileUrl) throw new ApiError(400, 'Service letter or FNF document is required');
      row.payslipFileUrls = payslips.slice(0, 3);
    }
    user.previousEmployerNotApplicable = false;
    user.experienceHistory = req.body.experienceHistory;
  }

  if (req.body.references !== undefined) {
    if (!Array.isArray(req.body.references)) throw new ApiError(400, 'references must be an array');
    user.references = req.body.references;
  }

  advanceStage(user, 'experience');
  await user.save();
  res.status(200).json({
    success: true,
    message: notApplicable ? 'Previous employer marked as not applicable' : 'Previous employer details saved',
    stage: user.onboardingStage,
    previousEmployerNotApplicable: user.previousEmployerNotApplicable,
    experienceHistory: user.experienceHistory,
    references: user.references
  });
});

/** PATCH /api/onboarding/bank — wizard step 5 (final). */
export const saveBank = asyncHandler(async (req, res) => {
  const user = await loadSelf(req);
  // Require previous-employer step before bank (allows re-save once already at bank/completed).
  const stageIdx = STAGES.indexOf(user.onboardingStage);
  if (stageIdx < STAGES.indexOf('bank') && !experienceComplete(user)) {
    throw new ApiError(400, 'Complete previous employer details before bank details');
  }
  const b = req.body;
  user.employeeDetails = user.employeeDetails || {};
  user.employeeDetails.bankDetails = {
    accountHolderName: b.accountHolderName,
    accountNumber: b.accountNumber,
    bankName: b.bankName,
    ifscCode: b.ifscCode,
    upiId: b.upiId // Epic 8 (optional)
  };
  if (b.panNumber !== undefined) user.employeeDetails.panNumber = b.panNumber;
  if (b.uanNumber !== undefined) user.employeeDetails.uanNumber = b.uanNumber;
  if (b.esiNumber !== undefined) user.employeeDetails.esiNumber = b.esiNumber; // Epic 8
  if (b.professionalTaxNumber !== undefined) user.employeeDetails.professionalTaxNumber = b.professionalTaxNumber; // Epic 8
  advanceStage(user, 'bank');
  await user.save();
  res.status(200).json({ success: true, message: 'Bank details saved', stage: user.onboardingStage, bankDetails: user.employeeDetails.bankDetails });
});
