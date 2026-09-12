/**
 * Money helpers. All monetary values are stored as INTEGER PAISA to avoid
 * floating-point drift (CLAUDE.md guardrail). ₹50,000.50 => 5000050 paisa.
 */

export const rupeesToPaisa = (rupees) => Math.round(Number(rupees) * 100);

export const paisaToRupees = (paisa) => Math.round(Number(paisa)) / 100;

/** Percentage of a paisa amount, rounded to the nearest paisa. */
export const percentOfPaisa = (paisa, percent) =>
  Math.round((Number(paisa) * Number(percent)) / 100);

/** Group an integer using the Indian numbering system (e.g. 1234567 -> 12,34,567). */
const groupIndian = (intStr) => {
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  if (!rest) return last3;
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
};

/**
 * Format paisa as a display string. Uses the ASCII prefix "INR " by default
 * because the ₹ glyph is absent from the PDF standard (WinAnsi) fonts.
 */
export const formatINR = (paisa, { symbol = 'INR ', decimals = true } = {}) => {
  const negative = paisa < 0;
  const abs = Math.abs(Math.round(Number(paisa)));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  let out = symbol + groupIndian(String(rupees));
  if (decimals) out += '.' + String(paise).padStart(2, '0');
  return (negative ? '-' : '') + out;
};
