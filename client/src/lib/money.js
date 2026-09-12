// Client-side money helpers. Server stores INTEGER PAISA; we format for display
// and convert rupee inputs back to paisa where needed.

const groupIndian = (intStr) => {
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  if (!rest) return last3;
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
};

/** Format paisa (integer) as ₹X,XX,XXX(.PP). */
export const formatINR = (paisa, { decimals = false } = {}) => {
  if (paisa == null || Number.isNaN(Number(paisa))) return '—';
  const negative = paisa < 0;
  const abs = Math.abs(Math.round(Number(paisa)));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  let out = '₹' + groupIndian(String(rupees));
  if (decimals) out += '.' + String(paise).padStart(2, '0');
  return (negative ? '-' : '') + out;
};

export const rupeesToPaisa = (rupees) => Math.round(Number(rupees) * 100);
export const paisaToRupees = (paisa) => Math.round(Number(paisa)) / 100;
