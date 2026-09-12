import crypto from 'node:crypto';
import User from '../models/User.js';
import { refreshOpenOfferDates } from './offerService.js';

const splitName = (fullName) => {
  const parts = String(fullName).trim().split(/\s+/);
  const firstName = parts.shift() || 'Candidate';
  const lastName = parts.join(' ') || '-';
  return { firstName, lastName };
};

/**
 * Reset a soft-deleted user back to draft candidate state for a new offer cycle.
 * Clears deletedAt, deactivates login, and drops prior employee id for re-provisioning.
 */
export const restoreSoftDeletedCandidate = async (user, { fullName, joiningDate, offerDate } = {}) => {
  const { firstName, lastName } = splitName(fullName || `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`);

  user.deletedAt = null;
  user.isActive = false;
  user.onboardingStage = 'personal';
  user.password = crypto.randomBytes(24).toString('hex');
  user.passwordSetup = { tokenHash: null, expiresAt: null };
  user.personalDetails.firstName = firstName;
  user.personalDetails.lastName = lastName;

  if (!user.employeeDetails) user.employeeDetails = {};
  user.set('employeeDetails.employeeId', undefined);
  user.set('employeeDetails.designation', undefined);
  user.set('employeeDetails.department', undefined);
  if (joiningDate) user.employeeDetails.dateOfJoining = new Date(joiningDate);

  await user.save();
  await refreshOpenOfferDates(user.email, { joiningDate, offerDate, fullName });

  return user;
};

/**
 * Find or lazily create the User record that backs a candidate (lifecycle
 * "Draft" state). Reuses soft-deleted accounts (restores instead of forking).
 */
export const upsertCandidateUser = async ({ email, fullName, joiningDate, offerDate } = {}) => {
  const normalized = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    if (existing.deletedAt) {
      return restoreSoftDeletedCandidate(existing, { fullName, joiningDate, offerDate });
    }
    const { firstName, lastName } = splitName(fullName);
    if (fullName) {
      existing.personalDetails.firstName = firstName;
      existing.personalDetails.lastName = lastName;
      await existing.save();
    }
    await refreshOpenOfferDates(normalized, { joiningDate, offerDate, fullName });
    return existing;
  }

  const { firstName, lastName } = splitName(fullName);
  const placeholderAddress = { street: 'Pending', city: 'Pending', state: 'Pending', country: 'India', zipCode: '000000' };

  return User.create({
    email: normalized,
    password: crypto.randomBytes(24).toString('hex'),
    role: 'employee',
    isActive: false,
    onboardingStage: 'personal',
    personalDetails: { firstName, lastName, dateOfBirth: new Date('1970-01-01'), gender: 'Prefer not to say' },
    contactInfo: {
      personalMobile: '0000000000',
      emergencyContactName: 'Pending',
      emergencyContactRelation: 'Pending',
      emergencyContactPhone: '0000000000',
      presentAddress: { ...placeholderAddress },
      permanentAddress: { ...placeholderAddress }
    },
    ...(joiningDate ? { employeeDetails: { dateOfJoining: new Date(joiningDate) } } : {})
  });
};
