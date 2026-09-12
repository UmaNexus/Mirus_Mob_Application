import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import { X, Download } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { formatINR } from '../../lib/money.js';
import { payslipPdfUrl } from '../../api/payslips.js';
import { MONTHS } from '../../config/constants.js';
import { COMPANY_NAME } from '../../config/brand.js';

const monthName = (m) => MONTHS.find((x) => x.value === m)?.label || m;

const Line = ({ label, value, bold }) => (
  <div className={`flex justify-between py-1 text-sm ${bold ? 'font-semibold text-ink' : ''}`}>
    <span className={bold ? '' : 'text-muted'}>{label}</span>
    <span>{formatINR(value)}</span>
  </div>
);

const Meta = ({ label, value }) => (
  <div className="flex justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="font-medium text-ink">{value || '—'}</dd></div>
);

export default function SalarySlipPreview({ open, slip, onClose }) {
  if (!slip) return null;
  const m = slip.metaSnapshot || {};
  const f = slip.financialSummary || {};

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <div className="relative">
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8, color: '#fff', zIndex: 1 }} size="small"><X size={18} /></IconButton>
        {/* Letterhead */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-6 py-5 text-center text-white">
          <h2 className="text-lg font-bold">{COMPANY_NAME}</h2>
          <p className="text-sm text-primary-100">Salary Slip · {monthName(slip.month)} {slip.year}</p>
        </div>
      </div>

      <DialogContent>
        {/* Employee meta */}
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <Meta label="Employee" value={`${m.fullName} (${m.employeeDisplayId})`} />
          <Meta label="Department" value={m.department} />
          <Meta label="Designation" value={m.designation} />
          <Meta label="PAN" value={m.pan} />
          <Meta label="UAN" value={m.uan} />
          <Meta label="Bank A/C" value={m.bankAccountHidden} />
        </dl>

        {/* Earnings / Deductions */}
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-primary-700">Earnings</p>
            {(slip.earningsLedger || []).map((e, i) => <Line key={i} label={e.label} value={e.amount} />)}
            <div className="mt-1 border-t border-line"><Line label="Gross Earnings" value={f.grossEarnings} bold /></div>
          </div>
          <div>
            <p className="mb-1 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-danger">Deductions</p>
            {(slip.deductionsLedger || []).map((d, i) => <Line key={i} label={d.label} value={d.amount} />)}
            <div className="mt-1 border-t border-line"><Line label="Total Deductions" value={f.totalDeductions} bold /></div>
          </div>
        </div>

        {/* Net pay */}
        <div className="mt-4 flex flex-col gap-1 rounded-lg bg-primary-50 p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink">Net Pay (Take Home)</span>
            <span className="text-xl font-bold text-primary-700">{formatINR(f.netPay)}</span>
          </div>
          <p className="text-xs italic text-muted">{f.netPayInWords}</p>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <StatusBadge status={slip.paymentStatus} />
          <span className="text-xs text-muted">System-generated · no signature required</span>
        </div>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <a className="btn-primary" href={payslipPdfUrl(slip._id)} target="_blank" rel="noreferrer"><Download size={16} /> Download PDF</a>
      </DialogActions>
    </Dialog>
  );
}
