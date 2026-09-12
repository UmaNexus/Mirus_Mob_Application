import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Check, X } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import TablePager from '../../components/ui/TablePager.jsx';
import useAsync from '../../hooks/useAsync.js';
import useClientPager from '../../hooks/useClientPager.js';
import { listLeaves, decideLeave } from '../../api/attendance.js';
import { notifyError } from '../ui/toastSlice.js';
import { userDisplayName, pad2 } from './dateHelpers.js';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'];
const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

const monthStartKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
const monthEndKey = (d = new Date()) => {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(last)}`;
};

/**
 * Admin leaves register with filters + inline approve/reject for Pending rows.
 * Date range is optional — empty From/To lists all requests (including future leave).
 */
export default function LeavesRegister({ onDecided }) {
  const dispatch = useDispatch();
  const [status, setStatus] = useState('Pending');
  const [type, setType] = useState('');
  const [userId, setUserId] = useState('');
  // Empty by default so future-dated pending leave always appears for approval.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busyId, setBusyId] = useState(null);

  const params = useMemo(() => ({
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(userId ? { userId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {})
  }), [status, type, userId, from, to]);

  const leaves = useAsync(() => listLeaves(params), [JSON.stringify(params)]);

  const decide = async (id, nextStatus) => {
    setBusyId(id);
    try {
      await decideLeave(id, { status: nextStatus });
      await leaves.reload();
      onDecided?.(nextStatus);
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusyId(null);
    }
  };

  const rows = leaves.data || [];
  const pager = useClientPager(rows, 10);
  const summary = useMemo(() => {
    const s = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
    for (const l of rows) if (s[l.status] !== undefined) s[l.status] += 1;
    return s;
  }, [rows]);

  const setThisMonth = () => {
    const n = new Date();
    setFrom(monthStartKey(n));
    setTo(monthEndKey(n));
  };
  const clearDates = () => { setFrom(''); setTo(''); };

  return (
    <Card className="mb-4">
      <CardBody>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-ink">Leaves register</h3>
          <p className="text-xs text-muted">
            Approve or reject leave requests. Leave date filters empty to include future-dated leave; use This month only when you want a period view.
          </p>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TextField type="date" size="small" label="From" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField type="date" size="small" label="To" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="">All statuses</MenuItem>
            {LEAVE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <MenuItem value="">All types</MenuItem>
            {LEAVE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <EmployeeSelect value={userId} onChange={setUserId} emptyLabel="All employees" />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={clearDates}>All dates</button>
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={setThisMonth}>This month</button>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Pending: {summary.Pending}</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Approved: {summary.Approved}</span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800">Rejected: {summary.Rejected}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Cancelled: {summary.Cancelled}</span>
        </div>

        {leaves.loading ? (
          <div className="flex justify-center py-10"><Spinner size={28} className="text-primary-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">From</th>
                  <th className="pb-2">To</th>
                  <th className="pb-2">Days</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Reason</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((l) => (
                  <tr key={l._id} className="border-t border-line">
                    <td className="py-2">
                      <p className="font-medium text-ink">{userDisplayName(l.userId)}</p>
                      <p className="text-[11px] text-muted">{l.userId?.employeeDetails?.employeeId || l.userId?.email || ''}</p>
                    </td>
                    <td className="py-2">{l.type}</td>
                    <td className="py-2 whitespace-nowrap">{fmt(l.fromDate)}</td>
                    <td className="py-2 whitespace-nowrap">{fmt(l.toDate)}</td>
                    <td className="py-2">{l.days}</td>
                    <td className="py-2"><StatusBadge status={l.status} /></td>
                    <td className="py-2 text-muted max-w-[180px] truncate" title={l.reason || ''}>{l.reason || '—'}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {l.status === 'Pending' ? (
                        <>
                          <button
                            type="button"
                            className="btn-ghost p-1.5 text-success disabled:opacity-40"
                            disabled={busyId === l._id}
                            onClick={() => decide(l._id, 'Approved')}
                            title="Approve"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost p-1.5 text-danger disabled:opacity-40"
                            disabled={busyId === l._id}
                            onClick={() => decide(l._id, 'Rejected')}
                            title="Reject"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!pager.total && (
                  <tr><td colSpan={8} className="py-8 text-center text-muted">No leave requests match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!leaves.loading && (
          <TablePager
            page={pager.page} pages={pager.pages} total={pager.total} limit={pager.limit}
            showingCount={pager.pageRows.length}
            onPageChange={pager.setPage}
            onLimitChange={pager.setLimit}
          />
        )}

        {leaves.error && (
          <p className="mt-2 text-sm text-danger">{leaves.error}</p>
        )}
      </CardBody>
    </Card>
  );
}
