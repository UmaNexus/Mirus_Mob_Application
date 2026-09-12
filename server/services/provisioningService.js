import crypto from 'node:crypto';
import User from '../models/User.js';
import { sendCredentials } from './emailService.js';
import { clientOrigin } from '../utils/clientOrigin.js';

/** Mirus Med Sciences short prefix for employee codes. */
export const EMPLOYEE_ID_PREFIX = (process.env.EMPLOYEE_ID_PREFIX || 'MMS').toUpperCase();

/**
 * Next numeric suffix: max among existing MMS#### (or configured prefix) + 1.
 * Falls back to 21 when none exist yet (preserves historical sequence).
 */
// Compute the next numeric suffix for a company (tenant-scoped).
// Matches prefixes like MMS0001, MMS1, MMS0123 and extracts the numeric part.
const nextEmployeeIdNumber = async (companyId) => {
  const prefix = EMPLOYEE_ID_PREFIX;
  const re = new RegExp(`^${prefix}0*(\\d+)$`, 'i');
  const filter = { 'employeeDetails.employeeId': { $regex: re } };
  if (companyId) filter.companyId = companyId;

  const users = await User.find(filter, { 'employeeDetails.employeeId': 1 }).lean();

  let max = 0; // start at zero so first id becomes MMS0001
  for (const u of users) {
    const m = String(u.employeeDetails?.employeeId || '').match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
};

/**
 * Generate the next available employee id (MMS####), guaranteed unique.
 * Prefix defaults to MMS (Mirus Med Sciences); override with EMPLOYEE_ID_PREFIX.
 */
export const generateEmployeeId = async (companyId) => {
  const prefix = EMPLOYEE_ID_PREFIX;
  let n = await nextEmployeeIdNumber(companyId);
  // eslint-disable-next-line no-await-in-loop
  while (true) {
    const id = `${prefix}${String(n).padStart(4, '0')}`;
    // Fast existence check scoped to company
    // eslint-disable-next-line no-await-in-loop
    const exists = await User.exists({ companyId, 'employeeDetails.employeeId': id });
    if (!exists) return id;
    n += 1;
  }
};





/** A readable temporary password that satisfies the password policy (letter + digit, ≥8). */
export const generateTempPassword = () => `Hrms@${crypto.randomBytes(4).toString('hex')}`;

/**
 * Provision an accepted candidate into an active employee and issue login
 * credentials, emailing them. Idempotent on employeeId (kept if already set).
 *
 * @param {import('mongoose').Document} user
 * @param {{ offer?: object }} opts  optional offer to copy designation/department/joining from
 * @returns {Promise<{ employeeId: string, tempPassword: string }>}
 */
export const provisionEmployee = async (user, { offer } = {}) => {
  if (!user.employeeDetails) user.employeeDetails = {};
  if (!user.employeeDetails.employeeId) {
    user.employeeDetails.employeeId = await generateEmployeeId(user.companyId);
  }
  if (offer) {
    user.employeeDetails.designation = offer.position;
    user.employeeDetails.department = offer.department;
    user.employeeDetails.dateOfJoining = offer.joiningDate;
  }

  user.deletedAt = null;
  user.isActive = true;
  const tempPassword = generateTempPassword();
  user.password = tempPassword; // hashed by the pre-save hook
  user.passwordSetup = { tokenHash: null, expiresAt: null };
  // Attempt to save; on duplicate employeeId (race), regenerate and retry.
  const MAX_SAVE_ATTEMPTS = 10;
  let saved = false;
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS && !saved; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await user.save();
      saved = true;
    } catch (err) {
      // Mongo duplicate key error
      if (err && err.code === 11000 && /employeeDetails\.employeeId/i.test(err.message)) {
        // Generate a fresh id and retry
        // eslint-disable-next-line no-await-in-loop
        user.employeeDetails.employeeId = await generateEmployeeId(user.companyId);
        continue;
      }
      throw err;
    }
  }
  if (!saved) throw new Error('Unable to save user after multiple employeeId collisions');

  const fullName = `${user.personalDetails.firstName} ${user.personalDetails.lastName}`.trim();
  await sendCredentials({
    to: user.email,
    fullName,
    employeeId: user.employeeDetails.employeeId,
    email: user.email,
    tempPassword,
    loginUrl: `${clientOrigin()}/login`
  });

  return { employeeId: user.employeeDetails.employeeId, tempPassword };
};
