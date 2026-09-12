import { cn } from '../../lib/cn.js';

// Maps domain statuses to badge styles. Covers user, offer and payslip states.
const MAP = {
  active: { cls: 'badge-success', label: 'Active', dot: 'bg-success' },
  inactive: { cls: 'badge-neutral', label: 'Inactive', dot: 'bg-slate-400' },
  onboard: { cls: 'badge-warning', label: 'Onboarding', dot: 'bg-warning' },
  accepted: { cls: 'badge-success', label: 'Accepted', dot: 'bg-success' },
  sent: { cls: 'badge-warning', label: 'Sent', dot: 'bg-warning' },
  pending: { cls: 'badge-info', label: 'Pending', dot: 'bg-info' },
  declined: { cls: 'badge-danger', label: 'Declined', dot: 'bg-danger' },
  paid: { cls: 'badge-success', label: 'Paid', dot: 'bg-success' },
  processing: { cls: 'badge-warning', label: 'Processing', dot: 'bg-warning' },
  verified: { cls: 'badge-success', label: 'Verified', dot: 'bg-success' },
  rejected: { cls: 'badge-danger', label: 'Rejected', dot: 'bg-danger' },
  // Attendance
  present: { cls: 'badge-success', label: 'Present', dot: 'bg-success' },
  absent: { cls: 'badge-danger', label: 'Absent', dot: 'bg-danger' },
  'half-day': { cls: 'badge-warning', label: 'Half-Day', dot: 'bg-warning' },
  leave: { cls: 'badge-info', label: 'Leave', dot: 'bg-info' },
  holiday: { cls: 'badge-neutral', label: 'Holiday', dot: 'bg-slate-400' },
  weekoff: { cls: 'badge-neutral', label: 'WeekOff', dot: 'bg-slate-400' },
  // Leave request
  approved: { cls: 'badge-success', label: 'Approved', dot: 'bg-success' },
  cancelled: { cls: 'badge-neutral', label: 'Cancelled', dot: 'bg-slate-400' }
};

export default function StatusBadge({ status, label }) {
  const key = String(status || '').toLowerCase();
  const cfg = MAP[key] || { cls: 'badge-neutral', label: label || status || '—', dot: 'bg-slate-400' };
  return (
    <span className={cn(cfg.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {label || cfg.label}
    </span>
  );
}
