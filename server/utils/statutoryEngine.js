/**
 * Statutory payroll calculation engine (Epic 16). All money is in integer paisa.
 * These are simplified, configurable Indian statutory rules — a starting point
 * that HR/finance can tune; not a substitute for a compliance filing product.
 */

const round = (n) => Math.round(n);

// PF: employee contributes 12% of Basic, statutorily capped at a Basic of
// ₹15,000/month (1,500,000 paisa) unless the employer opts out of the cap.
export const computePF = (basicPaisa, { capBasic = true } = {}) => {
  const base = capBasic ? Math.min(basicPaisa, 1_500_000) : basicPaisa;
  return round(base * 0.12);
};

// ESI: applies only when monthly gross <= ₹21,000 (2,100,000 paisa).
// Employee contribution = 0.75% of gross.
export const computeESI = (grossPaisa) =>
  grossPaisa <= 2_100_000 ? round(grossPaisa * 0.0075) : 0;

// Professional Tax: simplified monthly slab (₹ gross). States differ; tune per state.
export const computePT = (grossPaisa) => {
  const rupees = grossPaisa / 100;
  if (rupees <= 15000) return 0;
  if (rupees <= 25000) return 15_000; // ₹150
  return 20_000; // ₹200
};

// TDS: simplified new-regime annual slabs on annual taxable income, spread monthly.
export const computeAnnualIncomeTax = (annualTaxablePaisa) => {
  const inc = annualTaxablePaisa / 100; // rupees
  const slabs = [
    [300000, 0], [600000, 0.05], [900000, 0.10],
    [1200000, 0.15], [1500000, 0.20], [Infinity, 0.30]
  ];
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of slabs) {
    if (inc > lower) {
      tax += (Math.min(inc, upper) - lower) * rate;
      lower = upper;
    } else break;
  }
  return round(tax * 100); // back to paisa
};

export const computeMonthlyTDS = (annualGrossPaisa) =>
  round(computeAnnualIncomeTax(annualGrossPaisa) / 12);

// Loss of pay: per-day = monthly gross / working days, times unpaid absent days.
export const computeLOP = (monthlyGrossPaisa, workingDays, absentDays) => {
  if (!workingDays || absentDays <= 0) return 0;
  return round((monthlyGrossPaisa / workingDays) * absentDays);
};

/**
 * Compute statutory deduction line items for a month from the frozen earnings.
 * @param {object} args
 * @param {number} args.basicPaisa
 * @param {number} args.grossPaisa
 * @param {number} [args.absentDays]
 * @param {number} [args.workingDays]
 * @returns {{ deductions: {label,amount}[], lopAmount:number }}
 */
export const computeStatutoryDeductions = ({ basicPaisa, grossPaisa, absentDays = 0, workingDays = 30 }) => {
  const deductions = [];
  const pf = computePF(basicPaisa);
  if (pf > 0) deductions.push({ label: 'Provident Fund (PF)', amount: pf });
  const esi = computeESI(grossPaisa);
  if (esi > 0) deductions.push({ label: 'ESI', amount: esi });
  const pt = computePT(grossPaisa);
  if (pt > 0) deductions.push({ label: 'Professional Tax', amount: pt });
  const tds = computeMonthlyTDS(grossPaisa * 12);
  if (tds > 0) deductions.push({ label: 'TDS', amount: tds });
  const lop = computeLOP(grossPaisa, workingDays, absentDays);
  if (lop > 0) deductions.push({ label: 'Loss of Pay', amount: lop });
  return { deductions, lopAmount: lop };
};
