/**
 * Client-side mirror of server/config/fieldForce.js, for building the Admin
 * Dashboard's role/manager pickers and labels. Purely presentational — the
 * server re-validates every hierarchy rule itself (tier match, cycles,
 * tenant) on every write, so nothing here is a security boundary.
 */
export const FIELD_TIERS = ['BDM', 'ASM', 'RSM', 'ZSM', 'NSM'];

export const FIELD_TIER_LABELS = {
  BDM: 'Business Development Manager',
  ASM: 'Area Sales Manager',
  RSM: 'Regional Sales Manager',
  ZSM: 'Zonal Sales Manager',
  NSM: 'National Sales Manager'
};

/** The exact tier (or `null` for "must be an HRMS Admin") each tier's manager must hold. */
export const REQUIRED_MANAGER_TIER = { NSM: null, ZSM: 'NSM', RSM: 'ZSM', ASM: 'RSM', BDM: 'ASM' };

export const MANAGER_TIERS = ['ASM', 'RSM', 'ZSM', 'NSM'];
