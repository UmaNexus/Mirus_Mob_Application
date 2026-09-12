import { useMemo, useState } from 'react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listAttendance, listLeaves } from '../../api/attendance.js';
import { fullName } from '../../config/constants.js';
import {
  toDateKey, daysOfMonth, daysOfWeek, monthLabel, shortDay,
  userDisplayName, userIdOf, addDays, startOfWeekMonday
} from './dateHelpers.js';

const ATT_STATUSES = ['Present', 'Absent', 'Half-Day', 'Leave', 'Holiday', 'WeekOff'];

const STATUS_CELL = {
  Present: { letter: 'P', cls: 'bg-emerald-100 text-emerald-800' },
  Absent: { letter: 'A', cls: 'bg-rose-100 text-rose-800' },
  'Half-Day': { letter: 'H', cls: 'bg-amber-100 text-amber-800' },
  Leave: { letter: 'L', cls: 'bg-sky-100 text-sky-800' },
  Holiday: { letter: 'Ho', cls: 'bg-slate-100 text-slate-600' },
  WeekOff: { letter: 'W', cls: 'bg-slate-100 text-slate-600' }
};

const now = new Date();

/**
 * Admin attendance register: month / week matrix of who is Present / Absent / on Leave.
 */
export default function AttendanceRegister({ employees = [] }) {
  const [view, setView] = useState('month'); // month | week
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [weekAnchor, setWeekAnchor] = useState(toDateKey(now));
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');

  const days = useMemo(() => {
    if (view === 'week') return daysOfWeek(new Date(weekAnchor));
    return daysOfMonth(year, month);
  }, [view, year, month, weekAnchor]);

  const from = toDateKey(days[0]);
  const to = toDateKey(days[days.length - 1]);

  const attendance = useAsync(
    () => listAttendance({ from, to, ...(userId ? { userId } : {}), ...(status ? { status } : {}) }),
    [from, to, userId, status]
  );
  const leaves = useAsync(
    () => listLeaves({ from, to, status: 'Approved', ...(userId ? { userId } : {}) }),
    [from, to, userId]
  );

  const { matrix, counts, rowEmployees } = useMemo(() => {
    const byUserDay = new Map(); // `${userId}|${dateKey}` -> status
    for (const r of attendance.data || []) {
      const uid = userIdOf(r);
      const key = `${uid}|${r.dateKey || toDateKey(r.date)}`;
      byUserDay.set(key, r.status);
    }
    // Overlay approved leaves onto days that have no attendance row.
    for (const lv of leaves.data || []) {
      const uid = userIdOf(lv);
      if (!uid) continue;
      const start = new Date(lv.fromDate);
      const end = new Date(lv.toDate);
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d = addDays(d, 1)) {
        const dk = toDateKey(d);
        if (dk < from || dk > to) continue;
        const key = `${uid}|${dk}`;
        if (!byUserDay.has(key)) byUserDay.set(key, 'Leave');
      }
    }

    const ids = new Set();
    for (const k of byUserDay.keys()) ids.add(k.split('|')[0]);
    if (userId) ids.add(userId);
    // Prefer directory order; fall back to anyone who has a record.
    const ordered = (employees.length
      ? employees.filter((e) => !userId || e._id === userId)
      : []
    ).map((e) => ({ _id: e._id, label: fullName(e), empId: e.employeeDetails?.employeeId }));

    const known = new Set(ordered.map((e) => e._id));
    for (const id of ids) {
      if (known.has(id)) continue;
      const sample = (attendance.data || []).find((r) => userIdOf(r) === id)
        || (leaves.data || []).find((r) => userIdOf(r) === id);
      ordered.push({
        _id: id,
        label: userDisplayName(sample?.userId),
        empId: sample?.userId?.employeeDetails?.employeeId
      });
    }

    const rows = userId ? ordered.filter((e) => e._id === userId) : ordered;
    const c = { Present: 0, Absent: 0, Leave: 0, Other: 0 };
    const grid = {};
    for (const emp of rows) {
      grid[emp._id] = {};
      for (const day of days) {
        const st = byUserDay.get(`${emp._id}|${toDateKey(day)}`) || '';
        grid[emp._id][toDateKey(day)] = st;
        if (st === 'Present') c.Present += 1;
        else if (st === 'Absent') c.Absent += 1;
        else if (st === 'Leave') c.Leave += 1;
        else if (st) c.Other += 1;
      }
    }
    return { matrix: grid, counts: c, rowEmployees: rows };
  }, [attendance.data, leaves.data, days, employees, userId, from, to]);

  const loading = attendance.loading || leaves.loading;
  const weekStart = startOfWeekMonday(new Date(weekAnchor));

  return (
    <Card className="mb-4">
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">Attendance register</h3>
            <p className="text-xs text-muted">See who is Present, Absent or on Leave for the selected period.</p>
          </div>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, v) => v && setView(v)}
          >
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
          </ToggleButtonGroup>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {view === 'month' ? (
            <>
              <TextField
                select size="small" label="Month" value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <MenuItem key={i + 1} value={i + 1}>
                    {new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' })}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select size="small" label="Year" value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {[year - 1, year, year + 1].map((y) => (
                  <MenuItem key={y} value={y}>{y}</MenuItem>
                ))}
              </TextField>
            </>
          ) : (
            <TextField
              type="date" size="small" label="Week of" InputLabelProps={{ shrink: true }}
              value={weekAnchor}
              onChange={(e) => setWeekAnchor(e.target.value)}
              helperText={`${toDateKey(weekStart)} → ${toDateKey(addDays(weekStart, 6))}`}
            />
          )}
          <TextField
            select size="small" label="Status" value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <MenuItem value="">All statuses</MenuItem>
            {ATT_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <EmployeeSelect value={userId} onChange={setUserId} label="Employee" emptyLabel="All employees" />
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">Present: {counts.Present}</span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-800">Absent: {counts.Absent}</span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-800">Leave: {counts.Leave}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {view === 'month' ? monthLabel(year, month) : `Week of ${toDateKey(weekStart)}`}
          </span>
          <span className="ml-auto flex flex-wrap gap-1.5 text-[10px] text-muted">
            {Object.entries(STATUS_CELL).map(([k, v]) => (
              <span key={k} className={`rounded px-1.5 py-0.5 ${v.cls}`}>{v.letter}={k}</span>
            ))}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner size={28} className="text-primary-600" /></div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="bg-surface text-left text-muted">
                  <th className="sticky left-0 z-10 bg-surface px-2 py-2 font-medium">Employee</th>
                  {days.map((d) => (
                    <th key={toDateKey(d)} className="px-1 py-2 text-center font-medium whitespace-nowrap">
                      {view === 'week' ? shortDay(d) : d.getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowEmployees.map((emp) => (
                  <tr key={emp._id} className="border-t border-line">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5">
                      <p className="font-medium text-ink truncate max-w-[140px]">{emp.label}</p>
                      {emp.empId && <p className="text-[10px] text-muted">{emp.empId}</p>}
                    </td>
                    {days.map((d) => {
                      const dk = toDateKey(d);
                      const st = matrix[emp._id]?.[dk] || '';
                      // When status filter is on, hide non-matching cells.
                      const show = !status || st === status;
                      const cell = STATUS_CELL[st];
                      return (
                        <td key={dk} className="px-0.5 py-1 text-center">
                          {show && cell ? (
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ${cell.cls}`} title={st}>
                              {cell.letter}
                            </span>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!rowEmployees.length && (
                  <tr>
                    <td colSpan={days.length + 1} className="py-8 text-center text-muted">
                      No attendance or approved leave in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
