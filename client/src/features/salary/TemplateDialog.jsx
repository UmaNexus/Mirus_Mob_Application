import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import { Plus, Trash2 } from 'lucide-react';
import FormDialog from '../../components/ui/FormDialog.jsx';
import { createTemplate, updateTemplate } from '../../api/salary.js';
import { CALC_TYPES } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

/** Stable formula key from the human label (no UI key field). */
export const keyFromLabel = (label) => {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'field';
};

const ensureUniqueKeys = (rows) => {
  const seen = new Map();
  return rows.map((r) => {
    const base = keyFromLabel(r.label);
    let key = base;
    let n = 2;
    while (seen.has(key)) key = `${base}_${n++}`;
    seen.set(key, true);
    return { ...r, key };
  });
};

const SPECIAL_ALLOWANCE = {
  label: 'Special Allowance',
  calculationType: 'balance_of_ctc',
  percent: '',
  amount: '',
  lockedBalance: true
};

const emptyRow = () => ({
  label: '',
  calculationType: 'percentage_of_ctc',
  percent: '',
  amount: '',
  lockedBalance: false
});

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtInr = (n) => round2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const isBasicRow = (r) => {
  const k = keyFromLabel(r.label);
  return k === 'basic' || k === 'basic_pay' || /^basic/.test(k);
};

const isBalanceRow = (r) => r.calculationType === 'balance_of_ctc' || r.lockedBalance;

const basicAmountOf = (earnings) => {
  const row = (earnings || []).find(isBasicRow);
  return row ? num(row.amount) : 0;
};

const amountFromPercent = (type, percent, monthlyCtc, basicAmt) => {
  const p = num(percent);
  if (type === 'percentage_of_ctc') return round2((monthlyCtc * p) / 100);
  if (type === 'percentage_of_basic') return round2((basicAmt * p) / 100);
  return 0;
};

const percentFromAmount = (type, amount, monthlyCtc, basicAmt) => {
  const a = num(amount);
  if (type === 'fixed') return '';
  if (type === 'percentage_of_basic') {
    if (basicAmt <= 0) return 0;
    return round2((a / basicAmt) * 100);
  }
  if (monthlyCtc <= 0) return 0;
  return round2((a / monthlyCtc) * 100);
};

/** Apply % → amount for %-based rows. Fixed / balance rows keep their semantics. */
const syncAmounts = (rows, monthlyCtc, basicAmt) =>
  (rows || []).map((r) => {
    if (isBalanceRow(r)) return { ...r, calculationType: 'balance_of_ctc', percent: '', amount: '' };
    if (r.calculationType === 'fixed') return { ...r, percent: '' };
    if (r.percent === '' || r.percent == null) return r;
    return {
      ...r,
      amount: amountFromPercent(r.calculationType, r.percent, monthlyCtc, basicAmt)
    };
  });

/** Ensure exactly one Special Allowance (Balance of CTC) row at the end. */
const ensureSpecialAllowance = (rows = []) => {
  const others = rows.filter((r) => !isBalanceRow(r));
  const existing = rows.find(isBalanceRow);
  const special = {
    ...SPECIAL_ALLOWANCE,
    label: existing?.label?.trim() || SPECIAL_ALLOWANCE.label
  };
  return [...others, special];
};

const mapStructureRows = (structure, { asEarnings = false } = {}) => {
  const mapped = (structure || []).map((row) => {
    const type = row.calculationType || 'percentage_of_ctc';
    if (type === 'fixed') {
      const amount = round2(num(row.valueFactor) / 100);
      return { label: row.label || '', calculationType: type, percent: '', amount, lockedBalance: false };
    }
    if (type === 'balance_of_ctc') {
      return {
        label: row.label || SPECIAL_ALLOWANCE.label,
        calculationType: type,
        percent: '',
        amount: '',
        lockedBalance: Boolean(asEarnings)
      };
    }
    return {
      label: row.label || '',
      calculationType: type,
      percent: num(row.valueFactor),
      amount: '',
      lockedBalance: false
    };
  });
  if (!asEarnings) return mapped.filter((r) => !isBalanceRow(r));
  return ensureSpecialAllowance(mapped);
};

/** Live CTC allocation summary for earnings (balance row excluded from allocated). */
export const summarizeEarningsVsCtc = (earnings, monthlyCtc) => {
  const monthly = num(monthlyCtc);
  const nonBalance = (earnings || []).filter((r) => !isBalanceRow(r));
  const allocated = round2(nonBalance.reduce((s, r) => s + num(r.amount), 0));
  const ctcPercentSum = round2(
    nonBalance
      .filter((r) => r.calculationType === 'percentage_of_ctc')
      .reduce((s, r) => s + num(r.percent), 0)
  );
  const remaining = round2(monthly - allocated);
  const overBy = remaining < 0 ? round2(Math.abs(remaining)) : 0;
  const status = monthly <= 0
    ? 'idle'
    : remaining < -0.009
      ? 'over'
      : remaining <= 0.009
        ? 'exact'
        : 'under';
  return {
    monthly,
    allocated,
    remaining: Math.max(remaining, 0),
    overBy,
    ctcPercentSum,
    status,
    specialAmount: Math.max(remaining, 0)
  };
};

function RowEditor({
  title,
  rows,
  onChange,
  monthlyCtc,
  basicAmt,
  canAdd,
  addHint,
  showBalanceAmount = false,
  balanceAmount = 0,
  allowRemoveBalance = false,
  /** When true (earnings only), keep a locked Special Allowance / Balance of CTC row. */
  withBalanceRow = false
}) {
  const finalize = (next) => onChange(withBalanceRow ? ensureSpecialAllowance(next) : next.filter((r) => !isBalanceRow(r)));

  const updateAt = (i, patch) => {
    finalize(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const onType = (i, calculationType) => {
    const r = rows[i];
    if (r.lockedBalance) return; // Special Allowance type is fixed
    // Balance of CTC is earnings-only — never allow it on deductions.
    if (calculationType === 'balance_of_ctc') {
      if (!withBalanceRow) return;
      const next = rows.map((row, idx) => {
        if (idx === i) return { ...row, calculationType, percent: '', amount: '', lockedBalance: true };
        if (isBalanceRow(row)) {
          return { ...row, calculationType: 'percentage_of_ctc', lockedBalance: false };
        }
        return row;
      });
      return finalize(next);
    }
    if (calculationType === 'fixed') {
      return updateAt(i, { calculationType, percent: '', amount: r.amount });
    }
    let percent = r.percent;
    let amount = r.amount;
    if (percent !== '' && percent != null) {
      amount = amountFromPercent(calculationType, percent, monthlyCtc, basicAmt);
    } else if (amount !== '' && amount != null) {
      percent = percentFromAmount(calculationType, amount, monthlyCtc, basicAmt);
    }
    updateAt(i, { calculationType, percent, amount });
  };

  const onPercent = (i, raw) => {
    const r = rows[i];
    if (isBalanceRow(r) || r.calculationType === 'fixed') return;
    if (raw === '') return updateAt(i, { percent: '', amount: '' });
    const amount = amountFromPercent(r.calculationType, raw, monthlyCtc, basicAmt);
    updateAt(i, { percent: raw, amount });
  };

  const onAmount = (i, raw) => {
    const r = rows[i];
    if (isBalanceRow(r)) return;
    if (r.calculationType === 'fixed') {
      return updateAt(i, { amount: raw, percent: '' });
    }
    if (raw === '') return updateAt(i, { amount: '', percent: '' });
    const percent = percentFromAmount(r.calculationType, raw, monthlyCtc, basicAmt);
    updateAt(i, { amount: raw, percent });
  };

  const typeOptions = CALC_TYPES.filter((c) => c.value !== 'balance_of_ctc');

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={!canAdd}
          title={canAdd ? 'Add field' : addHint}
          onClick={() => {
            const withoutBalance = rows.filter((r) => !isBalanceRow(r));
            finalize([...withoutBalance, emptyRow()]);
          }}
        >
          <Plus size={14} /> Add field
        </button>
      </div>
      {!canAdd && <p className="mb-2 text-xs text-amber-700">{addHint}</p>}
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-xs text-muted">
            No fields yet.{canAdd ? ' Click Add field to begin.' : ''}
          </p>
        )}
        {rows.map((r, i) => {
          const locked = isBalanceRow(r);
          const isFixed = r.calculationType === 'fixed';
          const inputsDisabled = locked || monthlyCtc <= 0;
          const displayAmount = locked && showBalanceAmount
            ? (monthlyCtc > 0 ? String(round2(balanceAmount)) : '')
            : r.amount;
          return (
            <div
              key={i}
              className={`grid grid-cols-12 items-start gap-2 ${locked ? 'rounded-md bg-emerald-50/80 p-2 ring-1 ring-emerald-200' : ''}`}
            >
              <TextField
                className="col-span-3"
                size="small"
                label="Label"
                value={r.label}
                onChange={(e) => updateAt(i, { label: e.target.value })}
                required
                disabled={r.lockedBalance}
              />
              <TextField
                className="col-span-3"
                size="small"
                select
                label="Type"
                value={r.calculationType}
                onChange={(e) => onType(i, e.target.value)}
                disabled={r.lockedBalance}
              >
                {(r.lockedBalance
                  ? CALC_TYPES.filter((c) => c.value === 'balance_of_ctc')
                  : typeOptions
                ).map((c) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                className="col-span-2"
                size="small"
                type="number"
                label="%"
                value={locked ? '' : r.percent}
                onChange={(e) => onPercent(i, e.target.value)}
                disabled={inputsDisabled || isFixed}
                inputProps={{ min: 0, step: '0.01' }}
                helperText={locked ? 'Auto' : undefined}
              />
              <TextField
                className="col-span-3"
                size="small"
                type="number"
                label="Amount (₹ / month)"
                value={displayAmount}
                onChange={(e) => onAmount(i, e.target.value)}
                disabled={inputsDisabled}
                inputProps={{ min: 0, step: '0.01' }}
                helperText={locked ? 'Fills remaining CTC' : undefined}
              />
              <IconButton
                className="col-span-1 mt-1"
                size="small"
                color="error"
                disabled={r.lockedBalance && !allowRemoveBalance}
                onClick={() => {
                  if (r.lockedBalance) return;
                  finalize(rows.filter((_, idx) => idx !== i));
                }}
                aria-label="Remove field"
                title={r.lockedBalance ? 'Special Allowance is required' : 'Remove field'}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CtcAllocationMeter({ summary }) {
  if (summary.monthly <= 0) return null;
  const pctUsed = Math.min(100, (summary.allocated / summary.monthly) * 100);
  const pctOver = summary.status === 'over'
    ? Math.min(40, (summary.overBy / summary.monthly) * 100)
    : 0;
  const barColor = summary.status === 'over'
    ? 'bg-red-500'
    : summary.status === 'exact'
      ? 'bg-emerald-500'
      : 'bg-amber-500';
  const box = summary.status === 'over'
    ? 'border-red-300 bg-red-50 text-red-900'
    : summary.status === 'exact'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : 'border-amber-300 bg-amber-50 text-amber-950';

  return (
    <div className={`rounded-lg border p-3 text-sm ${box}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {summary.status === 'over' && 'Earnings exceed monthly CTC'}
          {summary.status === 'exact' && 'Earnings match monthly CTC'}
          {summary.status === 'under' && 'Special Allowance will take the remainder'}
        </p>
        <p className="text-xs font-medium tabular-nums">
          % of CTC fields: {summary.ctcPercentSum}%
          {summary.ctcPercentSum > 100 ? ' (over 100%)' : ''}
        </p>
      </div>
      <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-white/70 ring-1 ring-black/5">
        <div className="flex h-full w-full">
          <div className={`h-full ${barColor}`} style={{ width: `${pctUsed}%` }} />
          {pctOver > 0 && (
            <div className="h-full bg-red-700/80" style={{ width: `${pctOver}%` }} />
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted">Monthly CTC</dt>
          <dd className="font-semibold tabular-nums">₹ {fmtInr(summary.monthly)}</dd>
        </div>
        <div>
          <dt className="text-muted">Allocated (excl. Special)</dt>
          <dd className="font-semibold tabular-nums">₹ {fmtInr(summary.allocated)}</dd>
        </div>
        <div>
          <dt className="text-muted">Special Allowance</dt>
          <dd className="font-semibold tabular-nums">
            {summary.status === 'over' ? '—' : `₹ ${fmtInr(summary.specialAmount)}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{summary.status === 'over' ? 'Over by' : 'Remaining'}</dt>
          <dd className="font-semibold tabular-nums">
            ₹ {fmtInr(summary.status === 'over' ? summary.overBy : summary.remaining)}
          </dd>
        </div>
      </dl>
      {summary.status === 'over' && (
        <p className="mt-2 text-xs">
          Reduce % of CTC / fixed amounts so the total is at most monthly CTC.
          Example: 50% + 50% + 25% of CTC = 125% — that is not allowed.
        </p>
      )}
    </div>
  );
}

export default function TemplateDialog({ open, template, onClose, onSaved }) {
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [annualCtc, setAnnualCtc] = useState('');
  const [earnings, setEarnings] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [saving, setSaving] = useState(false);

  const monthlyCtc = useMemo(() => {
    const annual = num(annualCtc);
    return annual > 0 ? annual / 12 : 0;
  }, [annualCtc]);

  const basicAmt = useMemo(() => basicAmountOf(earnings), [earnings]);
  const canAddFields = monthlyCtc > 0;
  const ctcSummary = useMemo(
    () => summarizeEarningsVsCtc(earnings, monthlyCtc),
    [earnings, monthlyCtc]
  );

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name || '');
      setDescription(template.description || '');
      setAnnualCtc('');
      setEarnings(mapStructureRows(template.earningsStructure, { asEarnings: true }));
      setDeductions(mapStructureRows(template.deductionsStructure, { asEarnings: false }));
    } else {
      setName('');
      setDescription('');
      setAnnualCtc('');
      setEarnings(ensureSpecialAllowance([]));
      setDeductions([]);
    }
  }, [open, template]);

  /** Keep balance amounts in sync after CTC / earnings edits. */
  const refreshEarnings = (rows, monthly = monthlyCtc) => {
    const pass1 = syncAmounts(ensureSpecialAllowance(rows), monthly, 0).map((r) => {
      if (r.calculationType === 'percentage_of_basic' || r.calculationType === 'fixed' || isBalanceRow(r)) {
        return r;
      }
      if (r.percent === '' || r.percent == null) return r;
      return {
        ...r,
        amount: amountFromPercent(r.calculationType, r.percent, monthly, 0)
      };
    });
    const basic = basicAmountOf(pass1);
    return pass1.map((r) => {
      if (r.calculationType !== 'percentage_of_basic') return r;
      if (r.percent === '' || r.percent == null) return r;
      return {
        ...r,
        amount: amountFromPercent('percentage_of_basic', r.percent, monthly, basic)
      };
    });
  };

  const applyCtc = (raw) => {
    setAnnualCtc(raw);
    const monthly = num(raw) > 0 ? num(raw) / 12 : 0;
    if (monthly <= 0) return;
    // Recompute earnings first, then cascade deductions from that Basic.
    // Using stale `earnings` here made PF/%-of-basic use the previous CTC's
    // Basic (e.g. typing 600000 left PF on Basic from 60000 → ₹200 instead of ₹2000).
    setEarnings((prev) => {
      const next = refreshEarnings(prev, monthly);
      const basic = basicAmountOf(next);
      setDeductions((dPrev) => dPrev.map((r) => {
        if (r.calculationType === 'fixed' || isBalanceRow(r)) return r;
        if (r.percent === '' || r.percent == null) return r;
        return {
          ...r,
          amount: amountFromPercent(r.calculationType, r.percent, monthly, basic)
        };
      }));
      return next;
    });
  };

  const setEarningsAndCascade = (next) => {
    const synced = refreshEarnings(next, monthlyCtc);
    setEarnings(synced);
    const basic = basicAmountOf(synced);
    setDeductions((prev) => prev.map((r) => {
      if (r.calculationType !== 'percentage_of_basic') return r;
      if (r.percent === '' || r.percent == null) return r;
      return {
        ...r,
        amount: amountFromPercent('percentage_of_basic', r.percent, monthlyCtc, basic)
      };
    }));
  };

  const toStoredRow = (row) => {
    const type = isBalanceRow(row) ? 'balance_of_ctc' : row.calculationType;
    const label = String(row.label || '').trim();
    // Keep engine-compatible basic key (salaryEngine resolves % of Basic via "basic").
    const key = isBasicRow(row) ? 'basic' : (keyFromLabel(label) || 'field');
    if (type === 'fixed') {
      return {
        key,
        label,
        calculationType: type,
        valueFactor: Math.round(num(row.amount) * 100)
      };
    }
    if (type === 'balance_of_ctc') {
      return { key: keyFromLabel(label) || 'special_allowance', label, calculationType: type, valueFactor: 0 };
    }
    return {
      key,
      label,
      calculationType: type,
      valueFactor: num(row.percent)
    };
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canAddFields) {
      return dispatch(notifyError('Enter Annual CTC first, then add salary fields.'));
    }
    const withSpecial = ensureSpecialAllowance(earnings);
    if (!withSpecial.some((r) => !isBalanceRow(r))) {
      return dispatch(notifyError('Add at least one earning field besides Special Allowance.'));
    }
    if (
      withSpecial.some((r) => !String(r.label || '').trim())
      || deductions.some((r) => !String(r.label || '').trim())
    ) {
      return dispatch(notifyError('Every field needs a label.'));
    }
    const summary = summarizeEarningsVsCtc(withSpecial, monthlyCtc);
    if (summary.ctcPercentSum > 100) {
      return dispatch(notifyError(
        `% of CTC fields add up to ${summary.ctcPercentSum}% (max 100%). Reduce percentages or use Special Allowance for the rest.`
      ));
    }
    if (summary.status === 'over') {
      return dispatch(notifyError(
        `Earnings exceed monthly CTC by ₹ ${fmtInr(summary.overBy)}. Reduce amounts before saving.`
      ));
    }

    setSaving(true);
    try {
      const body = {
        name,
        description,
        earningsStructure: ensureUniqueKeys(withSpecial.map(toStoredRow)),
        // Balance of CTC must never appear under deductions (zeros Net Take Home).
        deductionsStructure: ensureUniqueKeys(
          deductions.filter((r) => !isBalanceRow(r)).map(toStoredRow)
        )
      };
      if (template) await updateTemplate(template._id, body);
      else await createTemplate(body);
      dispatch(notifySuccess(`Template ${template ? 'updated' : 'created'}.`));
      onSaved?.();
      onClose();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      onSubmit={submit}
      loading={saving}
      maxWidth="md"
      title={template ? 'Edit Salary Model' : 'New Salary Model'}
      formId="template-form"
    >
      <div className="space-y-5 pt-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
          />
        </div>

        <div className="rounded-lg border border-primary-200 bg-orange-50/50 p-3">
          <p className="mb-2 text-sm font-semibold text-ink">1. Annual CTC (required first)</p>
          <p className="mb-3 text-xs text-muted">
            Enter CTC to unlock fields. % and monthly amount stay in sync (Annual ÷ 12).
            CTC is only used while building the model — it is not saved on the template.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Annual CTC (₹)"
              type="number"
              size="small"
              value={annualCtc}
              onChange={(e) => applyCtc(e.target.value)}
              required
              inputProps={{ min: 0, step: '1000' }}
              fullWidth
            />
            <TextField
              label="Monthly CTC (₹)"
              size="small"
              value={monthlyCtc > 0 ? fmtInr(monthlyCtc) : '—'}
              InputProps={{ readOnly: true }}
              fullWidth
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">2. Earnings</p>
          <RowEditor
            title="Earnings components"
            rows={earnings}
            onChange={setEarningsAndCascade}
            monthlyCtc={monthlyCtc}
            basicAmt={basicAmt}
            canAdd={canAddFields}
            addHint="Enter Annual CTC above before adding fields."
            showBalanceAmount
            balanceAmount={ctcSummary.specialAmount}
            withBalanceRow
          />
          <CtcAllocationMeter summary={ctcSummary} />
        </div>

        <RowEditor
          title="3. Deductions"
          rows={deductions}
          onChange={setDeductions}
          monthlyCtc={monthlyCtc}
          basicAmt={basicAmt}
          canAdd={canAddFields}
          addHint="Enter Annual CTC above before adding fields."
          withBalanceRow={false}
        />

        <p className="text-xs text-muted">
          <strong>Special Allowance</strong> is always Balance of CTC — it automatically receives
          whatever is left of monthly CTC after your other earnings. % of CTC fields cannot exceed 100%.
        </p>
      </div>
    </FormDialog>
  );
}
