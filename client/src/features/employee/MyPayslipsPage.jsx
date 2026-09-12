import { useMemo, useState } from 'react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { Download, Eye, Wallet } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import DataGrid from '../../components/ui/DataGrid.jsx';
import { Card } from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import SalarySlipPreview from '../salary/SalarySlipPreview.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listMyPayslips, payslipPdfUrl } from '../../api/payslips.js';
import { MONTHS, YEARS } from '../../config/constants.js';
import { formatINR } from '../../lib/money.js';

const monthName = (m) => MONTHS.find((x) => x.value === m)?.label || m;

export default function MyPayslipsPage() {
  const [year, setYear] = useState('');
  const [preview, setPreview] = useState(null);
  const { data: slips, loading, error } = useAsync(() => listMyPayslips(year ? { year } : {}), [year]);

  const columnDefs = useMemo(() => [
    { headerName: 'Statement Cycle', valueGetter: (p) => `${monthName(p.data.month)} ${p.data.year}`, minWidth: 180, flex: 1.5 },
    { headerName: 'Gross', valueGetter: (p) => p.data.financialSummary?.grossEarnings, valueFormatter: (p) => formatINR(p.value) },
    { headerName: 'Deductions', valueGetter: (p) => p.data.financialSummary?.totalDeductions, valueFormatter: (p) => formatINR(p.value) },
    { headerName: 'Net Take-Home', valueGetter: (p) => p.data.financialSummary?.netPay, valueFormatter: (p) => formatINR(p.value), cellClass: 'font-semibold' },
    {
      headerName: 'Action', filter: false, sortable: false, maxWidth: 130,
      cellRenderer: (p) => (
        <div className="flex h-full items-center gap-1">
          <Tooltip title="Preview"><button type="button" className="btn-ghost p-2 text-primary-600" onClick={() => setPreview(p.data)}><Eye size={16} /></button></Tooltip>
          <Tooltip title="Download PDF"><a className="btn-ghost p-2 text-primary-600" href={payslipPdfUrl(p.data._id)} target="_blank" rel="noreferrer"><Download size={16} /></a></Tooltip>
        </div>
      )
    }
  ], []);

  const rows = slips || [];

  return (
    <div>
      <PageHeader title="My Salary Slips" subtitle="View and download your monthly pay statements" />
      <Card className="mb-4 p-4">
        <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All years</MenuItem>
          {YEARS.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </TextField>
      </Card>

      {!loading && error && (
        <Card className="mb-4 p-4 text-sm text-danger">{error}</Card>
      )}

      {!loading && !error && rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No salary slips yet"
            message="When HR generates your payslip, it will appear here. You may also receive it by email with the PDF attached."
          />
        </Card>
      ) : (
        <DataGrid rowData={rows} columnDefs={columnDefs} loading={loading} height={520} paginationPageSize={12} />
      )}

      <SalarySlipPreview open={Boolean(preview)} slip={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
