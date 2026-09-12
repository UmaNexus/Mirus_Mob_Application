// Indian-numbering amount-to-words (Thousand, Lakh, Crore).
//   2100 -> "Two Thousand One Hundred"

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (rest) out += (h ? ' ' : '') + twoDigits(rest);
  return out;
};

/** @param {number} rupees @returns {string} title-cased words (no "Rupees" suffix) */
export const rupeesToWords = (rupees) => {
  let n = Math.floor(Math.abs(Number(rupees) || 0));
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const parts = [];
  if (crore) parts.push(threeDigits(crore) + ' Crore');
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (n) parts.push(threeDigits(n));
  return parts.join(' ').trim();
};
