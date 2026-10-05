/**
 * Helpers for the EXPLICIT dev/sandbox seed scripts only (never imported by the app).
 * Personas map to the exact production JobRole names; roles are looked up by exact name in
 * the target company and created only if missing (dev data), never renamed or deleted.
 */
import JobRole from '../../models/JobRole.js';

export const DEV_PERSONA_ROLE_NAMES = {
  ZSM: 'Zonal sales manager',
  RSM: 'Regional business manager',
  ASM: 'Area sales manager',
  BDM: 'Business development manager'
};

export const ensureJobRoleId = async (companyId, name) => {
  const existing = await JobRole.findOne({ companyId, name }).select('_id').lean();
  if (existing) return existing._id;
  const created = await JobRole.create({ companyId, name });
  return created._id;
};
