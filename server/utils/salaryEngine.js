import { percentOfPaisa } from './money.js';
import ApiError from './ApiError.js';

/**
 * Split annual CTC (paisa) into a monthly pool (paisa).
 * Integer paisa only — no floating rupees in the engine.
 * Uses nearest-paisa monthly amount (same as Math.round(annual/12)).
 * Special Allowance then makes Σ monthly earnings === this pool exactly.
 * Note: |12 × monthly − annual| is at most a few paisa when annual is not
 * divisible by 12; the letter's Annual CTC remains the contractual total.
 */
export const monthlyCtcFromAnnual = (annualCTCPaisa) => {
  const annual = Math.round(Number(annualCTCPaisa));
  return Math.round(annual / 12);
};

/**
 * Compute one structure block (earnings OR deductions) into resolved line
 * items. All amounts are in integer paisa (nearest paisa via percentOfPaisa).
 *
 * Resolution order (within a block):
 *   1. fixed / percentage_of_ctc           — independent
 *   2. percentage_of_basic                  — needs the resolved basic
 *   3. balance_of_ctc                       — absorbs the remaining CTC
 *
 * @param {Array} fields           structure fields from the template
 * @param {number} monthlyCTC      monthly CTC in paisa
 * @param {number} basicAmount     resolved monthly basic in paisa (for deductions, the EARNINGS basic)
 */
const computeBlock = (fields = [], monthlyCTC, basicAmount) => {
  const amounts = new Map();

  // Pass 1 — independent fields.
  for (const f of fields) {
    if (f.calculationType === 'fixed') {
      amounts.set(f.key, Math.round(f.valueFactor));
    } else if (f.calculationType === 'percentage_of_ctc') {
      amounts.set(f.key, percentOfPaisa(monthlyCTC, f.valueFactor));
    }
  }

  // Basic may be keyed "basic" or "basic_pay" (UI derives keys from labels).
  const basicEntry = [...amounts.entries()].find(([k]) => k === 'basic' || /^basic/i.test(k));
  const localBasic = basicEntry ? basicEntry[1] : basicAmount;

  // Pass 2 — percentage_of_basic.
  for (const f of fields) {
    if (f.calculationType === 'percentage_of_basic') {
      amounts.set(f.key, percentOfPaisa(localBasic, f.valueFactor));
    }
  }

  // Pass 3 — balance_of_ctc (earnings only). Never apply on deductions — that
  // would set a line to ~monthlyCTC − other deductions and zero Net Take Home.
  for (const f of fields) {
    if (f.calculationType === 'balance_of_ctc') {
      const allocated = [...amounts.values()].reduce((s, v) => s + v, 0);
      amounts.set(f.key, Math.max(monthlyCTC - allocated, 0));
    }
  }

  // Preserve declared order in the output.
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    monthlyAmount: amounts.get(f.key) ?? 0
  }));
};

const sum = (items) => items.reduce((s, i) => s + i.monthlyAmount, 0);

/**
 * Compute a frozen monthly salary breakdown for an employee from a template
 * and an annual CTC (both monetary inputs in paisa).
 *
 * Special Allowance (balance_of_ctc) absorbs monthly CTC − other earnings so
 * Gross === monthly CTC exactly (integer paisa, including values like ₹2,000.84).
 *
 * @returns {{earnings, deductions, grossEarnings, totalDeductions, netTakeHome}}
 */
export const computeBreakdown = (template, annualCTCPaisa) => {
  if (!template) throw new ApiError(400, 'Salary template is required');
  if (!Number.isFinite(annualCTCPaisa) || annualCTCPaisa <= 0) {
    throw new ApiError(400, 'annualCTC must be a positive amount');
  }

  const annual = Math.round(Number(annualCTCPaisa));
  const monthlyCTC = monthlyCtcFromAnnual(annual);
  const earningsStructure = [...(template.earningsStructure || [])];
  const hasBalance = earningsStructure.some((f) => f.calculationType === 'balance_of_ctc');

  // Templates created before Special Allowance was required: append it so Gross
  // still reconciles. New templates always include it from the setup UI.
  if (!hasBalance) {
    earningsStructure.push({
      key: 'special_allowance',
      label: 'Special Allowance',
      calculationType: 'balance_of_ctc',
      valueFactor: 0
    });
  }

  // Reject % of CTC totals over 100% (same rule as template UI).
  const ctcPercentSum = earningsStructure
    .filter((f) => f.calculationType === 'percentage_of_ctc')
    .reduce((s, f) => s + Number(f.valueFactor || 0), 0);
  if (ctcPercentSum > 100 + 1e-6) {
    throw new ApiError(
      400,
      `% of CTC earnings add up to ${ctcPercentSum}% (maximum 100%). Adjust the salary template.`
    );
  }

  const earnings = computeBlock(earningsStructure, monthlyCTC, 0);
  const allocatedWithoutBalance = earnings
    .filter((_, i) => earningsStructure[i]?.calculationType !== 'balance_of_ctc')
    .reduce((s, e) => s + e.monthlyAmount, 0);
  if (allocatedWithoutBalance > monthlyCTC + 1) {
    throw new ApiError(
      400,
      'Earnings exceed monthly CTC. Reduce fixed/% amounts or fix the salary template.'
    );
  }

  const basic = earnings.find((e) => e.key === 'basic' || /^basic/i.test(e.key || e.label || ''))
    ?.monthlyAmount ?? 0;
  // Strip accidental Balance-of-CTC rows from deductions (UI bug / bad data).
  const deductionsStructure = (template.deductionsStructure || [])
    .filter((f) => f.calculationType !== 'balance_of_ctc');
  const deductions = computeBlock(deductionsStructure, monthlyCTC, basic);

  const grossEarnings = sum(earnings);
  const totalDeductions = sum(deductions);
  const netTakeHome = grossEarnings - totalDeductions;

  return { earnings, deductions, grossEarnings, totalDeductions, netTakeHome };
};
