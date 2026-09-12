import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import { CalendarDays, Plus, Trash2, Users, Upload, Download } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listUsers } from '../../api/users.js';
import { fullName } from '../../config/constants.js';
import { markAttendance, markBulkAttendance, bulkUploadAttendance, listHolidays, createHoliday, deleteHoliday } from '../../api/attendance.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';
import AttendanceRegister from './AttendanceRegister.jsx';
import LeavesRegister from './LeavesRegister.jsx';

const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUSES = ['Present', 'Absent', 'Half-Day', 'Leave', 'WeekOff', 'Holiday'];
const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const yearOptions = () => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
};

export default function AttendanceAdminPage() {
  const dispatch = useDispatch();
  const holidays = useAsync(() => listHolidays({ year: new Date().getFullYear() }), []);
  const { data: usersResp } = useAsync(() => listUsers({ limit: 200, role: 'employee', status: 'active', employeesOnly: true }), []);
  const employees = usersResp?.data || [];
  const [att, setAtt] = useState({ userId: '', date: today(), status: 'Present' });
  const [bulk, setBulk] = useState({ userIds: [], date: today(), status: 'Present' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [uploadMode, setUploadMode] = useState('month'); // month | day
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear());
  const [uploadDate, setUploadDate] = useState(today());
  const [hol, setHol] = useState({ date: today(), name: '' });
  const [registerKey, setRegisterKey] = useState(0);

  const saveAtt = async () => {
    if (!att.userId) return dispatch(notifyError('Select an employee.'));
    try {
      await markAttendance(att);
      dispatch(notifySuccess('Attendance recorded.'));
      setRegisterKey((k) => k + 1);
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveBulk = async () => {
    if (!bulk.userIds.length) return dispatch(notifyError('Select at least one employee.'));
    setBulkBusy(true);
    try {
      const res = await markBulkAttendance(bulk);
      dispatch(notifySuccess(res.message || 'Bulk attendance recorded.'));
      setBulk({ ...bulk, userIds: [] });
      setRegisterKey((k) => k + 1);
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBulkBusy(false); }
  };
  const allSelected = employees.length > 0 && bulk.userIds.length === employees.length;
  const toggleAll = () => setBulk({ ...bulk, userIds: allSelected ? [] : employees.map((e) => e._id) });

  const importXlsx = async (file) => {
    if (!file) return;
    if (uploadMode === 'month') {
      if (!(uploadMonth >= 1 && uploadMonth <= 12) || !uploadYear) {
        return dispatch(notifyError('Select month and year before uploading.'));
      }
    } else if (!uploadDate) {
      return dispatch(notifyError('Select a date before uploading.'));
    }
    setBulkBusy(true);
    try {
      const period = uploadMode === 'day'
        ? { mode: 'day', date: uploadDate }
        : { mode: 'month', month: uploadMonth, year: uploadYear };
      const res = await bulkUploadAttendance(file, period);
      dispatch(notifySuccess(res.message || 'Attendance imported.'));
      if (res.failed?.length) dispatch(notifyError(`${res.failed.length} row(s) failed — check employee IDs.`));
      setRegisterKey((k) => k + 1);
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBulkBusy(false); }
  };
  const saveHol = async () => {
    if (!hol.name) return dispatch(notifyError('Enter a holiday name.'));
    try { await createHoliday(hol); dispatch(notifySuccess('Holiday saved.')); setHol({ date: today(), name: '' }); holidays.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const removeHol = async (id) => {
    try { await deleteHoliday(id); holidays.reload(); } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };

  return (
    <div>
      <PageHeader title="Attendance & Leave" subtitle="Month/week register, leave filters, mark attendance and holidays" />

      <AttendanceRegister key={`att-${registerKey}`} employees={employees} />
      <LeavesRegister
        onDecided={(status) => {
          dispatch(notifySuccess(`Leave ${status.toLowerCase()}.`));
          // Refresh attendance matrix only — do not remount leave filters.
          setRegisterKey((k) => k + 1);
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Record attendance</h3>
          <div className="space-y-3">
            <EmployeeSelect value={att.userId} onChange={(v) => setAtt({ ...att, userId: v })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField type="date" size="small" label="Date" InputLabelProps={{ shrink: true }} value={att.date} onChange={(e) => setAtt({ ...att, date: e.target.value })} />
              <TextField select size="small" label="Status" value={att.status} onChange={(e) => setAtt({ ...att, status: e.target.value })}>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </div>
            <Button onClick={saveAtt}>Save attendance</Button>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><Users size={18} className="text-primary-600" /> Bulk attendance</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <TextField type="date" size="small" label="Date" InputLabelProps={{ shrink: true }} value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })} />
              <TextField select size="small" label="Status" value={bulk.status} onChange={(e) => setBulk({ ...bulk, status: e.target.value })}>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </div>
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-emp-label">Employees</InputLabel>
              <Select
                labelId="bulk-emp-label" label="Employees" multiple value={bulk.userIds}
                onChange={(e) => setBulk({ ...bulk, userIds: e.target.value })}
                renderValue={(sel) => `${sel.length} selected`}
              >
                {employees.map((u) => (
                  <MenuItem key={u._id} value={u._id}>
                    <Checkbox size="small" checked={bulk.userIds.includes(u._id)} />
                    <ListItemText primary={fullName(u)} secondary={u.employeeDetails?.employeeId} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <div className="flex items-center justify-between">
              <button type="button" className="text-xs font-medium text-primary-600 hover:underline" onClick={toggleAll}>
                {allSelected ? 'Clear selection' : 'Select all employees'}
              </button>
              <Button onClick={saveBulk} loading={bulkBusy}>Mark {bulk.userIds.length || ''} attendance</Button>
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <p className="text-sm font-semibold text-ink">Import from Excel</p>
              <TextField
                select size="small" fullWidth label="Upload type"
                value={uploadMode}
                onChange={(e) => setUploadMode(e.target.value)}
              >
                <MenuItem value="month">Monthly attendance (month + year)</MenuItem>
                <MenuItem value="day">Single day attendance (specific date)</MenuItem>
              </TextField>

              {uploadMode === 'month' ? (
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    select size="small" label="Month"
                    value={uploadMonth}
                    onChange={(e) => setUploadMonth(Number(e.target.value))}
                  >
                    {MONTH_OPTIONS.map((label, i) => (
                      <MenuItem key={label} value={i + 1}>{label}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select size="small" label="Year"
                    value={uploadYear}
                    onChange={(e) => setUploadYear(Number(e.target.value))}
                  >
                    {yearOptions().map((y) => (
                      <MenuItem key={y} value={y}>{y}</MenuItem>
                    ))}
                  </TextField>
                </div>
              ) : (
                <TextField
                  type="date" size="small" fullWidth label="Date"
                  InputLabelProps={{ shrink: true }}
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className={`inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary-600 hover:underline ${bulkBusy ? 'pointer-events-none opacity-50' : ''}`}>
                  <Upload size={13} /> {bulkBusy ? 'Importing…' : 'Choose .xls / .xlsx'}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    hidden
                    disabled={bulkBusy}
                    onChange={(e) => { importXlsx(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
                <a
                  className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600"
                  href={uploadMode === 'day' ? '/samples/bulk-attendance-day-sample.xlsx' : '/samples/bulk-attendance-sample.xlsx'}
                  download
                >
                  <Download size={13} /> Sample
                </a>
              </div>
              <p className="text-muted">
                {uploadMode === 'month' ? (
                  <>
                    Upload the <strong>Mirus Staff Attendance</strong> matrix for the selected month/year.
                    Row 2 = weekday shorts (WED, THUR…), row 3 = day numbers; marks <strong>P</strong>/<strong>A</strong>/<strong>L</strong> only.
                    Empty / blank cells do not update attendance. Sundays are blocked and never imported.
                    Select the correct month/year so weekdays line up with the sheet.
                  </>
                ) : (
                  <>
                    Upload Emp.Id + Status for the selected date (P/A/L or Present/Absent/Leave),
                    or a Mirus monthly sheet — only that day’s column is imported.
                    Empty status leaves attendance unchanged; Sundays are blocked.
                  </>
                )}
              </p>
            </div>
          </div>
        </CardBody></Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><CalendarDays size={18} className="text-primary-600" /> Holiday calendar</h3>
          <div className="mb-3 flex items-end gap-2">
            <TextField type="date" size="small" label="Date" InputLabelProps={{ shrink: true }} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
            <TextField size="small" label="Name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
            <Button size="sm" onClick={saveHol}><Plus size={14} /> Add</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {(holidays.data || []).map((h) => (
              <li key={h._id} className="flex items-center justify-between border-t border-line py-2">
                <span><span className="font-medium text-ink">{h.name}</span> <span className="text-muted">— {fmt(h.date)}</span></span>
                <button className="btn-ghost p-1 text-danger" onClick={() => removeHol(h._id)}><Trash2 size={14} /></button>
              </li>
            ))}
            {!holidays.data?.length && <li className="py-4 text-center text-muted">No holidays set.</li>}
          </ul>
        </CardBody></Card>
      </div>
    </div>
  );
}
