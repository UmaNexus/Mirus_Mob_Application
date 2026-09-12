import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBreakdown } from '../utils/salaryEngine.js';
import { rupeesToWords } from '../utils/numberToWords.js';
import { formatINR, rupeesToPaisa } from '../utils/money.js';

// A representative template mirroring the wireframe (Module 4).
const template = {
  earningsStructure: [
    { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 },
    { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 50 },
    { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
  ],
  deductionsStructure: [
    { key: 'pf', label: 'PF', calculationType: 'percentage_of_basic', valueFactor: 12 },
    { key: 'pt', label: 'PT', calculationType: 'fixed', valueFactor: 20000 } // ₹200 in paisa
  ]
};

test('breakdown is computed in integer paisa with balance absorbing the remainder', () => {
  const annualCTC = rupeesToPaisa(1200000); // ₹12,00,000 -> ₹1,00,000 / month
  const b = computeBreakdown(template, annualCTC);

  const basic = b.earnings.find((e) => e.key === 'basic').monthlyAmount;
  const hra = b.earnings.find((e) => e.key === 'hra').monthlyAmount;
  const special = b.earnings.find((e) => e.key === 'special').monthlyAmount;

  assert.equal(basic, 4500000); // 45% of 1,00,000 = ₹45,000
  assert.equal(hra, 2250000); // 50% of basic = ₹22,500

  // Earnings always sum back to the monthly CTC because of balance_of_ctc.
  assert.equal(basic + hra + special, 10000000);

  // PF = 12% of basic; PT fixed.
  assert.equal(b.deductions.find((d) => d.key === 'pf').monthlyAmount, 540000);
  assert.equal(b.deductions.find((d) => d.key === 'pt').monthlyAmount, 20000);

  assert.equal(b.grossEarnings, 10000000);
  assert.equal(b.totalDeductions, 560000);
  assert.equal(b.netTakeHome, 9440000);
});

test('rejects non-positive CTC', () => {
  assert.throws(() => computeBreakdown(template, 0), /positive/);
});

test('HRA % of Basic works when basic key is basic_pay', () => {
  const tpl = {
    earningsStructure: [
      { key: 'basic_pay', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 },
      { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 50 },
      { key: 'special_allowance', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [
      { key: 'pf', label: 'PF', calculationType: 'percentage_of_basic', valueFactor: 12 }
    ]
  };
  const b = computeBreakdown(tpl, rupeesToPaisa(1200000));
  assert.equal(b.earnings.find((e) => e.key === 'hra').monthlyAmount, 2250000);
  assert.equal(b.netTakeHome, 10000000 - 540000);
});

test('balance_of_ctc in deductions is ignored so Net is not zeroed', () => {
  const tpl = {
    earningsStructure: [
      { key: 'basic', label: 'Basic', calculationType: 'percentage_of_ctc', valueFactor: 50 },
      { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [
      { key: 'pf', label: 'Provident Fund', calculationType: 'percentage_of_basic', valueFactor: 12 },
      // Accidental Special Allowance under deductions (UI Add-field bug)
      { key: 'special_allowance', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ]
  };
  const b = computeBreakdown(tpl, rupeesToPaisa(2500000)); // monthly ≈ 208333.33
  assert.equal(b.deductions.length, 1);
  assert.ok(b.netTakeHome > 0);
  assert.equal(b.grossEarnings - b.totalDeductions, b.netTakeHome);
});

test('formatINR uses Indian grouping', () => {
  assert.equal(formatINR(9440000), 'INR 94,400.00');
  assert.equal(formatINR(rupeesToPaisa(1234567)), 'INR 12,34,567.00');
});

test('rupeesToWords uses the Indian numbering system', () => {
  assert.equal(rupeesToWords(84900), 'Eighty Four Thousand Nine Hundred Rupees Only');
  assert.equal(rupeesToWords(0), 'Zero Rupees Only');
  assert.equal(rupeesToWords(10000000), 'One Crore Rupees Only');
});
