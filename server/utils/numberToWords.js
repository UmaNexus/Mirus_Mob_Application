/**
 * Convert a whole-rupee amount into words using the Indian numbering system
 * (Thousand, Lakh, Crore). Used for the "Net Pay in words" payslip field.
 *   84900 -> "Eighty Four Thousand Nine Hundred Rupees Only"
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
};

const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (rest) out += (h ? ' ' : '') + twoDigits(rest);
  return out;
};

/** @param {number} rupees integer rupee amount */
export const rupeesToWords = (rupees) => {
  let n = Math.floor(Math.abs(Number(rupees)));
  if (n === 0) return 'Zero Rupees Only';

  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;

  const parts = [];
  if (crore) parts.push(threeDigits(crore) + ' Crore');
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(' ').trim() + ' Rupees Only';
};

/** Convenience wrapper that accepts paisa. */
export const paisaToWords = (paisa) => rupeesToWords(Math.round(Number(paisa) / 100));
