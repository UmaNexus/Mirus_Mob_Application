import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import { Zap, Download, RefreshCw, Eye } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import DataGrid from '../../components/ui/DataGrid.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import SalarySlipPreview from './SalarySlipPreview.jsx';
import { listPayslips, generatePayslips, payslipPdfUrl } from '../../api/payslips.js';
import { MONTHS, YEARS } from '../../config/constants.js';
import { formatINR } from '../../lib/money.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function PayslipsPage() {
  const dispatch = useDispatch();
  const now = { month: 6, year: 2026 };
  const [period, setPeriod] = useState(now);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notify, setNotify] = useState(false);
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);

  const fetchSlips = async () => {
    setLoading(true);
    try {
      const data = await listPayslips({ ...period, limit: 100 });
      setRows(data.data);
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSlips(); }, [period]);

  const generate = async (employeeIds) => {
    setGenerating(true);
    try {
      const res = await generatePayslips({ ...period, employeeIds, notify });
      dispatch(notifySuccess(res.message));
      fetchSlips();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setGenerating(false);
    }
  };

  const columnDefs = useMemo(() => [
    { headerCheckboxSelection: true, checkboxSelection: true, width: 48, maxWidth: 48, filter: false, sortable: false, flex: 0 },
    { headerName: 'Employee ID', valueGetter: (p) => p.data.metaSnapshot?.employeeDisplayId, maxWidth: 140 },
    { headerName: 'Employee Name', valueGetter: (p) => p.data.metaSnapshot?.fullName, minWidth: 180, flex: 2 },
    { headerName: 'Department', valueGetter: (p) => p.data.metaSnapshot?.department },
    { headerName: 'Net Pay', valueGetter: (p) => p.data.financialSummary?.netPay, valueFormatter: (p) => formatINR(p.value), maxWidth: 150 },
    { headerName: 'Status', field: 'paymentStatus', cellRenderer: (p) => <StatusBadge status={p.value} />, filter: false, maxWidth: 150 },
    {
      headerName: 'Actions', filter: false, sortable: false, maxWidth: 160,
      cellRenderer: (p) => (
        <div className="flex h-full items-center gap-1">
          <Tooltip title="Preview"><button className="btn-ghost p-2 text-primary-600" onClick={() => setPreview(p.data)}><Eye size={16} /></button></Tooltip>
          <Tooltip title="Download PDF"><a className="btn-ghost p-2 text-primary-600" href={payslipPdfUrl(p.data._id)} target="_blank" rel="noreferrer"><Download size={16} /></a></Tooltip>
          <Tooltip title="Regenerate"><button className="btn-ghost p-2" onClick={() => generate([p.data.employeeId])}><RefreshCw size={16} /></button></Tooltip>
        </div>
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [period, notify]);

  return (
    <div>
      <PageHeader
        title="Salary Slips" subtitle="Generate and distribute monthly payslips"
        actions={
          <>
            {selected.length > 0 && (
              <Button variant="secondary" loading={generating} onClick={() => generate(selected.map((s) => s.employeeId))}>
                <RefreshCw size={16} /> Regenerate {selected.length} selected
              </Button>
            )}
            <Button loading={generating} onClick={() => generate(undefined)}><Zap size={16} /> Generate All</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <TextField select size="small" label="Month" value={period.month} onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })} sx={{ minWidth: 150 }}>
            {MONTHS.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Year" value={period.year} onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })} sx={{ minWidth: 120 }}>
            {YEARS.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
          <FormControlLabel
            control={<Checkbox size="small" checked={notify} onChange={(e) => setNotify(e.target.checked)} />}
            label={<span className="text-sm text-muted">Email salary slip PDF to employees</span>}
          />
        </div>
        {notify && (
          <p className="mt-2 text-xs text-muted">
            Each generated slip is emailed to the employee with the PDF attached. They can also open it under Salary Slips after login.
          </p>
        )}
      </Card>

      <DataGrid
        rowData={rows} columnDefs={columnDefs} loading={loading} height={560}
        rowSelection="multiple" rowMultiSelectWithClick
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows())}
      />

      <SalarySlipPreview open={Boolean(preview)} slip={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
