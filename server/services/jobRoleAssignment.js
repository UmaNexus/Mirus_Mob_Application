import mongoose from 'mongoose';
import JobRole from '../models/JobRole.js';
import ApiError from '../utils/ApiError.js';

/**
 * The ONE place where a JobRole is chosen for an employee. Every workflow that assigns a role
 * or a designation (Admin role assignment, user edit, offer letters, offer approval /
 * provisioning) goes through here so that
 *
 *   JobRole.name -> employeeDetails.designation   (HRMS / display compatibility)
 *   JobRole._id  -> employeeDetails.jobRole       (authoritative field-force identity)
 *
 * are always written together, from an EXISTING, active JobRole of the SAME company. Nothing
 * here ever creates a JobRole, and nothing reads a designation back to guess a role at login.
 */

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve the JobRole an operation refers to — by `jobRoleId` (preferred; the client sends the id of
 * a role it picked from GET /job-roles) or, for API/bulk callers that only have text, by an exact
 * (trimmed, case-insensitive) `name` that matches exactly one role. Throws a clear 400 when the role
 * does not exist, belongs to another company, is inactive, or the name is ambiguous.
 */
export const resolveJobRoleOrThrow = async ({ companyId, jobRoleId, name }) => {
  if (!companyId) throw new ApiError(400, 'A company is required to resolve a job role');
  if (jobRoleId) {
    if (!mongoose.isValidObjectId(jobRoleId)) throw new ApiError(400, 'Invalid job role id');
    const role = await JobRole.findOne({ _id: jobRoleId, companyId, active: true }).select('name').lean();
    if (!role) throw new ApiError(400, 'Job role not found or inactive — select an existing active job role');
    return role;
  }
  const text = String(name ?? '').trim();
  if (!text) throw new ApiError(400, 'A job role is required — select one from the job roles list');
  const matches = await JobRole.find({ companyId, active: true, name: new RegExp(`^${escapeRegex(text)}$`, 'i') }).select('name').lean();
  if (matches.length === 0) {
    throw new ApiError(400, `No existing active job role named "${text}" — select an existing job role (job roles are managed in Setup → Roles)`);
  }
  if (matches.length > 1) throw new ApiError(400, `More than one job role matches "${text}" — select the exact job role`);
  return matches[0];
};

/** Write a resolved JobRole onto a User document: designation and jobRole together. */
export const assignJobRoleToUser = (user, role) => {
  user.set('employeeDetails.designation', role.name);
  user.set('employeeDetails.jobRole', role._id);
};

/** Clear both together (a cleared role must not leave a stale reference behind). */
export const clearJobRoleOnUser = (user) => {
  user.set('employeeDetails.jobRole', null);
};
