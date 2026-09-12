import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { CalendarCheck, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import useAsync from '../../hooks/useAsync.js';
import { markMyAttendance, myAttendance, applyLeave, myLeaves } from '../../api/attendance.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';
import {
  toDateKey, daysOfMonth, daysOfWeek, monthLabel, shortDay,
  startOfWeekMonday, addDays
} from './dateHelpers.js';

const today = () => toDateKey(new Date());
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUSES = ['Present', 'Absent', 'Half-Day', 'WeekOff'];
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'];
const LEAVE_STATUSES = ['', 'Pending', 'Approved', 'Rejected', 'Cancelled'];

const now = new Date();

export default function MyAttendancePage() {
  const dispatch = useDispatch();
  const [view, setView] = useState('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [weekAnchor, setWeekAnchor] = useState(today());
  const [leaveStatus, setLeaveStatus] = useState('');
  const [status, setStatus] = useState('Present');
  const [marking, setMarking] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'Casual', fromDate: today(), toDate: today(), reason: '' });
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => (
    view === 'week' ? daysOfWeek(new Date(weekAnchor)) : daysOfMonth(year, month)
  ), [view, year, month, weekAnchor]);
  const from = toDateKey(days[0]);
  const to = toDateKey(days[days.length - 1]);

  const att = useAsync(() => myAttendance({ from, to }), [from, to]);
  const leaves = useAsync(myLeaves, []);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const r of att.data || []) m.set(r.dateKey || toDateKey(r.date), r.status);
    return m;
  }, [att.data]);

  const filteredLeaves = useMemo(() => {
    const rows = leaves.data || [];
    if (!leaveStatus) return rows;
    return rows.filter((l) => l.status === leaveStatus);
  }, [leaves.data, leaveStatus]);

  const mark = async () => {
    setMarking(true);
    try {
      await markMyAttendance({ date: today(), status });
      dispatch(notifySuccess('Attendance marked for today.'));
      att.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setMarking(false); }
  };

  const submitLeave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await applyLeave(leaveForm);
      dispatch(notifySuccess('Leave request submitted.'));
      setLeaveOpen(false);
      leaves.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setSaving(false); }
  };

  const weekStart = startOfWeekMonday(new Date(weekAnchor));

  return (
    <div>
      <PageHeader title="Attendance & Leave" subtitle="Mark attendance, view month/week register and leave history"
        actions={<Button onClick={() => setLeaveOpen(true)}><Plus size={16} /> Apply for leave</Button>} />

      <Card className="mb-4"><CardBody>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-ink"><CalendarCheck size={18} className="text-primary-600" /><span className="font-semibold">Mark today ({fmt(today())})</span></div>
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <Button onClick={mark} loading={marking}>Mark attendance</Button>
        </div>
      </CardBody></Card>

      <Card className="mb-4"><CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">My attendance</h3>
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
          </ToggleButtonGroup>
        </div>
        <div className="mb-3 flex flex-wrap gap-3">
          {view === 'month' ? (
            <>
              <TextField select size="small" label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))} sx={{ minWidth: 140 }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <MenuItem key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' })}</MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} sx={{ minWidth: 100 }}>
                {[year - 1, year, year + 1].map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
              </TextField>
              <span className="self-center text-xs text-muted">{monthLabel(year, month)}</span>
            </>
          ) : (
            <TextField
              type="date" size="small" label="Week of" InputLabelProps={{ shrink: true }}
              value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value)}
              helperText={`${toDateKey(weekStart)} → ${toDateKey(addDays(weekStart, 6))}`}
            />
          )}
        </div>
        {att.loading ? (
          <div className="flex justify-center py-8"><Spinner size={28} className="text-primary-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Day</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const dk = toDateKey(d);
                  const st = byDay.get(dk);
                  return (
                    <tr key={dk} className="border-t border-line">
                      <td className="py-2">{fmt(d)}</td>
                      <td className="py-2 text-muted">{shortDay(d)}</td>
                      <td className="py-2">{st ? <StatusBadge status={st} /> : <span className="text-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody></Card>

      <Card><CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">My leave requests</h3>
          <TextField select size="small" label="Status" value={leaveStatus} onChange={(e) => setLeaveStatus(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="">All</MenuItem>
            {LEAVE_STATUSES.filter(Boolean).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-2">Type</th>
              <th className="pb-2">From</th>
              <th className="pb-2">To</th>
              <th className="pb-2">Days</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeaves.map((l) => (
              <tr key={l._id} className="border-t border-line">
                <td className="py-2">{l.type}</td>
                <td className="py-2">{fmt(l.fromDate)}</td>
                <td className="py-2">{fmt(l.toDate)}</td>
                <td className="py-2">{l.days}</td>
                <td className="py-2"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
            {!filteredLeaves.length && <tr><td colSpan={5} className="py-6 text-center text-muted">No leave requests.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

      <FormDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Apply for leave" onSubmit={submitLeave} loading={saving} submitLabel="Submit">
        <div className="space-y-3 py-1">
          <TextField select fullWidth size="small" label="Leave type" value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}>
            {LEAVE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <div className="grid grid-cols-2 gap-3">
            <TextField type="date" fullWidth size="small" label="From" InputLabelProps={{ shrink: true }} value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} />
            <TextField type="date" fullWidth size="small" label="To" InputLabelProps={{ shrink: true }} value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} />
          </div>
          <TextField fullWidth size="small" label="Reason" multiline rows={2} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
        </div>
      </FormDialog>
    </div>
  );
}
