import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Plus, Gauge, Upload, Download, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import DataGrid from '../../components/ui/DataGrid.jsx';
import TablePager from '../../components/ui/TablePager.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import JobRoleSelect from '../../components/feature/JobRoleSelect.jsx';
import useAsync from '../../hooks/useAsync.js';
import {
  listReviews, createReview, deleteReview,
  createIncentive, listIncentives, incentiveAttachmentUrl, deleteIncentive,
  createAppraisal, listAppraisals, appraisalAttachmentUrl, deleteAppraisal,
  createTrainingRecord
} from '../../api/performance.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const rupees = (p) => `INR ${((p || 0) / 100).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const employeeName = (u) => {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  const name = `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim();
  if (name) return `${name}${u.employeeDetails?.employeeId ? ` (${u.employeeDetails.employeeId})` : ''}`;
  return u.email || '—';
};

const AttachmentLink = ({ fileId, url }) => fileId
  ? <a className="inline-flex items-center gap-1 text-primary-600 hover:underline" href={url} target="_blank" rel="noreferrer"><Download size={14} /> View</a>
  : <span className="text-muted">—</span>;

const FileField = ({ file, onChange }) => (
  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-primary-400">
    <Upload size={16} /> {file ? file.name : 'Attach supporting PDF (optional)'}
    <input type="file" accept="application/pdf" hidden onChange={(e) => onChange(e.target.files?.[0] || null)} />
  </label>
);

const emptyPag = { page: 1, limit: 10, total: 0, pages: 1 };

export default function PerformancePage() {
  const dispatch = useDispatch();
  const [revPage, setRevPage] = useState(1);
  const [revLimit, setRevLimit] = useState(10);
  const [incPage, setIncPage] = useState(1);
  const [incLimit, setIncLimit] = useState(10);
  const [aprPage, setAprPage] = useState(1);
  const [aprLimit, setAprLimit] = useState(10);

  const reviews = useAsync(() => listReviews({ page: revPage, limit: revLimit }), [revPage, revLimit]);
  const incentives = useAsync(() => listIncentives({ page: incPage, limit: incLimit }), [incPage, incLimit]);
  const appraisals = useAsync(() => listAppraisals({ page: aprPage, limit: aprLimit }), [aprPage, aprLimit]);

  const [revOpen, setRevOpen] = useState(false);
  const [rev, setRev] = useState({ userId: '', period: '', overallRating: 3, comments: '', status: 'Published', kpis: [] });
  const [busy, setBusy] = useState(false);

  const [inc, setInc] = useState({ userId: '', period: '', amountRupees: '', reason: '', file: null });
  const [apr, setApr] = useState({ userId: '', effectiveDate: today(), newDesignation: '', newCTCRupees: '', remarks: '', file: null });
  const [trn, setTrn] = useState({ userId: '', title: '', provider: '', status: 'Assigned' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const reviewRows = reviews.data?.data || [];
  const reviewPag = reviews.data?.pagination || emptyPag;
  const incentiveRows = incentives.data?.data || [];
  const incentivePag = incentives.data?.pagination || emptyPag;
  const appraisalRows = appraisals.data?.data || [];
  const appraisalPag = appraisals.data?.pagination || emptyPag;

  const saveReview = async (e) => {
    e.preventDefault();
    if (!rev.userId || !rev.period) return dispatch(notifyError('Employee and period are required.'));
    setBusy(true);
    try { await createReview(rev); dispatch(notifySuccess('Review saved.')); setRevOpen(false); reviews.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const addKpi = () => setRev((r) => ({ ...r, kpis: [...r.kpis, { title: '', target: '', achieved: '', score: 3 }] }));
  const setKpi = (i, patch) => setRev((r) => ({ ...r, kpis: r.kpis.map((k, idx) => idx === i ? { ...k, ...patch } : k) }));

  const saveInc = async () => {
    if (!inc.userId || !inc.period || !inc.amountRupees) return dispatch(notifyError('Employee, period and amount are required.'));
    try {
      await createIncentive({ userId: inc.userId, period: inc.period, amount: Math.round(Number(inc.amountRupees) * 100), reason: inc.reason }, inc.file);
      dispatch(notifySuccess('Incentive recorded.'));
      setInc({ userId: '', period: '', amountRupees: '', reason: '', file: null });
      setIncPage(1);
      incentives.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveApr = async () => {
    if (!apr.userId) return dispatch(notifyError('Select an employee.'));
    try {
      await createAppraisal({
        userId: apr.userId, effectiveDate: apr.effectiveDate, newDesignation: apr.newDesignation,
        newCTC: apr.newCTCRupees ? Math.round(Number(apr.newCTCRupees) * 100) : undefined, remarks: apr.remarks
      }, apr.file);
      dispatch(notifySuccess('Promotion recorded.'));
      setApr({ userId: '', effectiveDate: today(), newDesignation: '', newCTCRupees: '', remarks: '', file: null });
      setAprPage(1);
      appraisals.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveTrn = async () => {
    if (!trn.userId || !trn.title) return dispatch(notifyError('Employee and title are required.'));
    try { await createTrainingRecord(trn); dispatch(notifySuccess('Training record saved.')); setTrn({ userId: '', title: '', provider: '', status: 'Assigned' }); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'review') {
        await deleteReview(deleteTarget._id);
        reviews.reload();
      } else if (deleteTarget.kind === 'incentive') {
        await deleteIncentive(deleteTarget._id);
        incentives.reload();
      } else {
        await deleteAppraisal(deleteTarget._id);
        appraisals.reload();
      }
      dispatch(notifySuccess('Record deleted.'));
      setDeleteTarget(null);
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not delete.'));
    } finally {
      setDeleting(false);
    }
  };

  const incentiveColumns = useMemo(() => [
    {
      headerName: 'Employee', minWidth: 200, flex: 2, filter: false,
      cellRenderer: (p) => <span>{employeeName(p.data?.userId)}</span>
    },
    { headerName: 'Period', field: 'period', maxWidth: 130 },
    { headerName: 'Amount', valueGetter: (p) => p.data.amount, valueFormatter: (p) => rupees(p.value), maxWidth: 150 },
    { headerName: 'Reason', field: 'reason', flex: 2 },
    { headerName: 'Status', field: 'status', cellRenderer: (p) => <StatusBadge status={p.value} />, filter: false, maxWidth: 140 },
    { headerName: 'Attachment', cellRenderer: (p) => <AttachmentLink fileId={p.data.attachmentFileId} url={incentiveAttachmentUrl(p.data._id)} />, filter: false, sortable: false, maxWidth: 130 },
    {
      headerName: '', maxWidth: 70, filter: false, sortable: false,
      cellRenderer: (p) => (
        <button type="button" className="btn-ghost p-1 text-danger" onClick={() => setDeleteTarget({ kind: 'incentive', _id: p.data._id })} aria-label="Delete incentive">
          <Trash2 size={14} />
        </button>
      )
    }
  ], []);

  const appraisalColumns = useMemo(() => [
    {
      headerName: 'Employee', minWidth: 200, flex: 2, filter: false,
      cellRenderer: (p) => <span>{employeeName(p.data?.userId)}</span>
    },
    { headerName: 'Effective date', valueGetter: (p) => p.data.effectiveDate, valueFormatter: (p) => fmtDate(p.value), maxWidth: 150 },
    { headerName: 'Previous designation', field: 'previousDesignation', flex: 1 },
    { headerName: 'New designation', field: 'newDesignation', flex: 1 },
    { headerName: 'New CTC', valueGetter: (p) => p.data.newCTC, valueFormatter: (p) => (p.value ? rupees(p.value) : '—'), maxWidth: 140 },
    { headerName: 'Attachment', cellRenderer: (p) => <AttachmentLink fileId={p.data.attachmentFileId} url={appraisalAttachmentUrl(p.data._id)} />, filter: false, sortable: false, maxWidth: 130 },
    {
      headerName: '', maxWidth: 70, filter: false, sortable: false,
      cellRenderer: (p) => (
        <button type="button" className="btn-ghost p-1 text-danger" onClick={() => setDeleteTarget({ kind: 'appraisal', _id: p.data._id })} aria-label="Delete promotion">
          <Trash2 size={14} />
        </button>
      )
    }
  ], []);

  return (
    <div>
      <PageHeader title="Performance & Training" subtitle="Reviews, incentives, promotions and training records"
        actions={<Button onClick={() => setRevOpen(true)}><Plus size={16} /> New review</Button>} />

      <Card className="mb-4"><CardBody>
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><Gauge size={18} className="text-primary-600" /> Performance reviews</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Employee</th><th className="pb-2">Period</th><th className="pb-2">Rating</th><th className="pb-2">Status</th><th className="pb-2 text-right" /></tr></thead>
          <tbody>
            {reviewRows.map((r) => (
              <tr key={r._id} className="border-t border-line">
                <td className="py-2">{employeeName(r.userId)}</td>
                <td className="py-2">{r.period}</td>
                <td className="py-2">{r.overallRating}/5</td>
                <td className="py-2"><StatusBadge status={r.status === 'Published' ? 'active' : 'pending'} label={r.status} /></td>
                <td className="py-2 text-right">
                  <button type="button" className="btn-ghost p-1 text-danger" onClick={() => setDeleteTarget({ kind: 'review', _id: r._id })} aria-label="Delete review">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {!reviewRows.length && <tr><td colSpan={5} className="py-6 text-center text-muted">No reviews yet.</td></tr>}
          </tbody>
        </table>
        <TablePager
          page={reviewPag.page} pages={reviewPag.pages} total={reviewPag.total} limit={revLimit}
          showingCount={reviewRows.length}
          onPageChange={setRevPage}
          onLimitChange={(n) => { setRevLimit(n); setRevPage(1); }}
        />
      </CardBody></Card>

      <Card className="mb-4"><CardBody>
        <h3 className="mb-3 text-base font-semibold text-ink">Incentives</h3>
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5 md:items-start">
          <EmployeeSelect value={inc.userId} onChange={(v) => setInc({ ...inc, userId: v })} />
          <TextField size="small" fullWidth label="Period (e.g. Q1-2026)" value={inc.period} onChange={(e) => setInc({ ...inc, period: e.target.value })} />
          <TextField size="small" fullWidth label="Amount (₹)" type="number" value={inc.amountRupees} onChange={(e) => setInc({ ...inc, amountRupees: e.target.value })} />
          <TextField size="small" fullWidth label="Reason" value={inc.reason} onChange={(e) => setInc({ ...inc, reason: e.target.value })} />
          <div className="flex items-center gap-2">
            <FileField file={inc.file} onChange={(f) => setInc({ ...inc, file: f })} />
          </div>
        </div>
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={saveInc}><Plus size={13} /> Save incentive</Button>
        </div>
        <DataGrid
          rowData={incentiveRows}
          columnDefs={incentiveColumns}
          loading={incentives.loading}
          height={360}
          pagination={false}
        />
        <TablePager
          page={incentivePag.page} pages={incentivePag.pages} total={incentivePag.total} limit={incLimit}
          showingCount={incentiveRows.length}
          onPageChange={setIncPage}
          onLimitChange={(n) => { setIncLimit(n); setIncPage(1); }}
        />
      </CardBody></Card>

      <Card className="mb-4"><CardBody>
        <h3 className="mb-3 text-base font-semibold text-ink">Promotions</h3>
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5 md:items-start">
          <EmployeeSelect value={apr.userId} onChange={(v) => setApr({ ...apr, userId: v })} />
          <TextField size="small" fullWidth type="date" label="Effective date" InputLabelProps={{ shrink: true }} value={apr.effectiveDate} onChange={(e) => setApr({ ...apr, effectiveDate: e.target.value })} />
          <JobRoleSelect value={apr.newDesignation} onChange={(v) => setApr({ ...apr, newDesignation: v })} label="New designation" />
          <TextField size="small" fullWidth label="New CTC (₹)" type="number" value={apr.newCTCRupees} onChange={(e) => setApr({ ...apr, newCTCRupees: e.target.value })} />
          <div className="flex items-center gap-2">
            <FileField file={apr.file} onChange={(f) => setApr({ ...apr, file: f })} />
          </div>
        </div>
        <Button size="sm" onClick={saveApr} className="mb-4"><Plus size={13} /> Save promotion</Button>
        <DataGrid
          rowData={appraisalRows}
          columnDefs={appraisalColumns}
          loading={appraisals.loading}
          height={360}
          pagination={false}
        />
        <TablePager
          page={appraisalPag.page} pages={appraisalPag.pages} total={appraisalPag.total} limit={aprLimit}
          showingCount={appraisalRows.length}
          onPageChange={setAprPage}
          onLimitChange={(n) => { setAprLimit(n); setAprPage(1); }}
        />
      </CardBody></Card>

      <Card><CardBody>
        <h3 className="mb-3 text-base font-semibold text-ink">Add training record</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <EmployeeSelect value={trn.userId} onChange={(v) => setTrn({ ...trn, userId: v })} />
          <TextField size="small" fullWidth label="Title" value={trn.title} onChange={(e) => setTrn({ ...trn, title: e.target.value })} />
          <TextField size="small" fullWidth label="Provider" value={trn.provider} onChange={(e) => setTrn({ ...trn, provider: e.target.value })} />
          <TextField select size="small" fullWidth label="Status" value={trn.status} onChange={(e) => setTrn({ ...trn, status: e.target.value })}>
            {['Assigned', 'In-Progress', 'Completed'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </div>
        <Button size="sm" onClick={saveTrn} className="mt-3">Save record</Button>
      </CardBody></Card>

      <FormDialog open={revOpen} onClose={() => setRevOpen(false)} title="New performance review" onSubmit={saveReview} loading={busy} submitLabel="Save review" maxWidth="md">
        <div className="space-y-3 py-1">
          <EmployeeSelect value={rev.userId} onChange={(v) => setRev({ ...rev, userId: v })} />
          <div className="grid grid-cols-2 gap-3">
            <TextField size="small" label="Period (e.g. Q1-2026)" value={rev.period} onChange={(e) => setRev({ ...rev, period: e.target.value })} />
            <TextField size="small" type="number" label="Overall rating (0-5)" value={rev.overallRating} onChange={(e) => setRev({ ...rev, overallRating: Number(e.target.value) })} inputProps={{ min: 0, max: 5 }} />
          </div>
          <TextField size="small" fullWidth multiline rows={2} label="Comments" value={rev.comments} onChange={(e) => setRev({ ...rev, comments: e.target.value })} />
          <TextField select size="small" fullWidth label="Status" value={rev.status} onChange={(e) => setRev({ ...rev, status: e.target.value })}>
            <MenuItem value="Draft">Draft</MenuItem><MenuItem value="Published">Published (visible to employee)</MenuItem>
          </TextField>
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-ink">KPIs</span><Button size="sm" variant="secondary" onClick={addKpi}><Plus size={13} /> Add KPI</Button></div>
          {rev.kpis.map((k, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <TextField size="small" label="Title" value={k.title} onChange={(e) => setKpi(i, { title: e.target.value })} sx={{ gridColumn: 'span 4' }} />
              <TextField size="small" label="Target" value={k.target} onChange={(e) => setKpi(i, { target: e.target.value })} sx={{ gridColumn: 'span 3' }} />
              <TextField size="small" label="Achieved" value={k.achieved} onChange={(e) => setKpi(i, { achieved: e.target.value })} sx={{ gridColumn: 'span 3' }} />
              <TextField size="small" type="number" label="Score" value={k.score} onChange={(e) => setKpi(i, { score: Number(e.target.value) })} sx={{ gridColumn: 'span 2' }} />
            </div>
          ))}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete record?"
        confirmLabel="Delete"
        message="This record will be permanently removed."
      />
    </div>
  );
}
