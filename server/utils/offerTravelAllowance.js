/**
 * Role-based "Other allowance" / travel line for offer letters.
 * Returns null when the line must be omitted (Admin, HR, IT, unknown roles).
 */

const EXCLUDED = [
  /\badmin(?:istrator|istration)?\b/i,
  /\bhr\b/i,
  /\bhuman\s*resources?\b/i,
  /\bit\b/i,
  /\binformation\s*technology\b/i
];

/**
 * Ordered matchers — first hit wins.
 * `test` receives a normalized haystack: "position department".
 */
const ROLE_LINES = [
  {
    key: 'BDM',
    test: (s) => /\bbdm\b/.test(s)
      || /business\s*development\s*manager/.test(s),
    text: 'Daily - Rs 320, Outstation - Rs 520, Per Km - Rs 3.50'
  },
  {
    key: 'ASM',
    test: (s) => /\basm\b/.test(s)
      || /area\s*sales\s*manager/.test(s)
      || /area\s*development\s*manager/.test(s),
    text: 'Daily - Rs 425, Outstation - Rs 600, Stay - Rs 1400 + GST, Per Km - Rs 3.50'
  },
  {
    key: 'RBM',
    test: (s) => /\brbm\b/.test(s)
      || /regional\s*business\s*manager/.test(s)
      || /regional\s*development\s*manager/.test(s),
    text: 'Headquarters - Rs 500, Outstation - Rs 700, Stay - Rs 1600 + GST, Per Km - Rs 3.50'
  },
  {
    key: 'ZSM',
    test: (s) => /\bzsm\b/.test(s)
      || /zonal\s*sales\s*manager/.test(s)
      || /zonal\s*business\s*manager/.test(s),
    text: 'Headquarters - Rs 600, Outstation - Rs 800, Stay - Rs 2000 + GST, Per Km - Rs 3.50'
  }
];

const haystackOf = (position, department) =>
  `${position || ''} ${department || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {string} [position] offer designation / job role
 * @param {string} [department] optional department (used only for exclusion checks)
 * @returns {{ roleKey: string, label: string, text: string } | null}
 */
export const getOfferTravelAllowanceLine = (position, department = '') => {
  const hay = haystackOf(position, department);
  if (!hay) return null;

  if (EXCLUDED.some((re) => re.test(hay))) return null;

  for (const role of ROLE_LINES) {
    if (role.test(hay)) {
      return {
        roleKey: role.key,
        label: 'Other allowance: ',
        text: role.text
      };
    }
  }
  return null;
};

export default getOfferTravelAllowanceLine;
