import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Plus, FileDown, LogOut, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import TablePager from '../../components/ui/TablePager.jsx';
import useAsync from '../../hooks/useAsync.js';
import useClientPager from '../../hooks/useClientPager.js';
import { listExits, initiateExit, updateExit, generateExitLetters, deleteExit } from '../../api/exits.js';
import { listUsers } from '../../api/users.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function ExitsPage() {
  const dispatch = useDispatch();
  const exits = useAsync(() => listExits(), []);
  const users = useAsync(() => listUsers({ limit: 500, employeesOnly: 'true' }), []);
  const pager = useClientPager(exits.data || [], 10);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ userId: '', resignationDate: today(), lastWorkingDay: today(), reason: '' });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [letterTarget, setLetterTarget] = useState(null);
  const [fnfForm, setFnfForm] = useState({ amount: '', lastWorkingDay: today(), reason: '' });
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const employeeMap = useMemo(() => {
    const map = new Map();
    for (const u of users.data?.data || []) {
      map.set(String(u._id), u);
    }
    return map;
  }, [users.data]);

  const issuedFnfRows = useMemo(() => {
    return (exits.data || [])
      .filter((r) => r.fnfLetterUrl || r.fnfSettlement?.status === 'Settled')
      .map((r) => {
        const user = employeeMap.get(String(r.userId));
        const fullName = user ? `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`.trim() || user.email : 'Employee';
        const amount = Number(r.fnfSettlement?.amount ?? 0) || 0;
        const issuedAt = r.fnfSettlement?.settledAt || r.updatedAt || r.createdAt || r.lastWorkingDay;
        return {
          _id: r._id,
          employeeName: fullName,
          email: user?.email || '—',
          employeeId: user?.employeeDetails?.employeeId || '—',
          designation: user?.employeeDetails?.designation || '—',
          amount,
          issuedAt,
          fnfLetterUrl: r.fnfLetterUrl
        };
      })
      .sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());
  }, [employeeMap, exits.data]);

  const issuedFNF = useClientPager(issuedFnfRows, 5);

  const create = async (e) => {
    e.preventDefault();
    if (!form.userId) return dispatch(notifyError('Select an employee.'));
    setBusy(true);
    try { await initiateExit(form); dispatch(notifySuccess('Exit initiated.')); setCreateOpen(false); setForm({ userId: '', resignationDate: today(), lastWorkingDay: today(), reason: '' }); exits.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const openLettersDialog = (r) => {
    setLetterTarget(r);
    setPreviewUrl('');
    setFnfForm({
      amount: r.fnfSettlement?.amount ? (Number(r.fnfSettlement.amount) / 100).toString() : '',
      lastWorkingDay: r.lastWorkingDay ? r.lastWorkingDay.slice(0, 10) : today(),
      reason: r.reason || ''
    });
  };

  const previewLetter = async () => {
    if (!letterTarget) return;
    setPreviewLoading(true);
    try {
      const res = await generateExitLetters(letterTarget._id, {
        previewOnly: true,
        fnfFields: {
          amount: fnfForm.amount,
          lastWorkingDay: fnfForm.lastWorkingDay,
          reason: fnfForm.reason
        }
      });
      setPreviewUrl(res.previewLetterUrl || res.fnfLetterUrl || '');
      if (!res.previewLetterUrl && !res.fnfLetterUrl) {
        dispatch(notifyError('Could not generate the letter preview.'));
      }
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setPreviewLoading(false); }
  };

  const letters = async (e) => {
    e.preventDefault();
    if (!letterTarget) return;
    try {
      await generateExitLetters(letterTarget._id, {
        fnfFields: {
          amount: fnfForm.amount,
          lastWorkingDay: fnfForm.lastWorkingDay,
          reason: fnfForm.reason
        }
      });
      dispatch(notifySuccess('Relieving, experience & F&F letters generated.'));
      setPreviewUrl('');
      setLetterTarget(null);
      exits.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateExit(edit._id, {
        status: edit.status,
        exitInterview: { notes: edit.interviewNotes, conductedAt: edit.interviewNotes ? new Date() : null },
        fnfSettlement: { amount: edit.fnfRupees ? Math.round(Number(edit.fnfRupees) * 100) : 0, status: edit.fnfStatus }
      });
      dispatch(notifySuccess('Exit updated.')); setEdit(null); exits.reload();
    } catch (err) { dispatch(notifyError(err.uiMessage)); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!deleteTarget?._id) return;
    setDeleting(true);
    try {
      await deleteExit(deleteTarget._id);
      dispatch(notifySuccess('Exit record deleted.'));
      setDeleteTarget(null);
      exits.reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not delete exit.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Exit / Offboarding" subtitle="Resignations, F&F settlement and exit documents"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Initiate exit</Button>} />

      <Card><CardBody>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Resigned</th><th className="pb-2">Last day</th><th className="pb-2">F&amp;F</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th></tr></thead>
          <tbody>
            {pager.pageRows.map((r) => (
              <tr key={r._id} className="border-t border-line">
                <td className="py-2">{fmt(r.resignationDate)}</td>
                <td className="py-2">{fmt(r.lastWorkingDay)}</td>
                <td className="py-2"><StatusBadge status={r.fnfSettlement?.status === 'Settled' ? 'paid' : 'pending'} label={r.fnfSettlement?.status || 'Pending'} /></td>
                <td className="py-2"><StatusBadge status={r.status === 'Completed' ? 'active' : 'processing'} label={r.status} /></td>
                <td className="py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setEdit({ _id: r._id, status: r.status, interviewNotes: r.exitInterview?.notes || '', fnfRupees: r.fnfSettlement?.amount ? r.fnfSettlement.amount / 100 : '', fnfStatus: r.fnfSettlement?.status || 'Pending' })}>Manage</Button>
                    <Button size="sm" onClick={() => openLettersDialog(r)}><FileDown size={14} /> Letters</Button>
                    <button type="button" className="btn-ghost p-1 text-danger" onClick={() => setDeleteTarget(r)} aria-label="Delete exit">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!pager.total && <tr><td colSpan={5} className="py-8 text-center text-muted"><LogOut className="mx-auto mb-2 text-slate-300" /> No exits in progress.</td></tr>}
          </tbody>
        </table>
        <TablePager
          page={pager.page} pages={pager.pages} total={pager.total} limit={pager.limit}
          showingCount={pager.pageRows.length}
          onPageChange={pager.setPage}
          onLimitChange={pager.setLimit}
        />
      </CardBody></Card>

      <Card className="mt-6"><CardBody>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">Issued F&amp;F settlements</h3>
            <p className="text-sm text-muted">Latest settlement letters first, with employee details and issue dates.</p>
          </div>
        </div>

        {issuedFNF.total ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2">Employee</th>
                    <th className="pb-2">Employee ID</th>
                    <th className="pb-2">Designation</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Issued date</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {issuedFNF.pageRows.map((row) => (
                    <tr key={row._id} className="border-t border-line align-top">
                      <td className="py-2">
                        <div className="font-medium text-ink">{row.employeeName}</div>
                      </td>
                      <td className="py-2">{row.employeeId}</td>
                      <td className="py-2">{row.designation}</td>
                      <td className="py-2">{row.email}</td>
                      <td className="py-2">{fmt(row.issuedAt)}</td>
                      <td className="py-2">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((row.amount || 0) / 100)}</td>
                      <td className="py-2">
                        {row.fnfLetterUrl ? (
                          <a href={row.fnfLetterUrl} target="_blank" rel="noreferrer" className="text-primary-600 underline">View</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePager
              page={issuedFNF.page}
              pages={issuedFNF.pages}
              total={issuedFNF.total}
              limit={issuedFNF.limit}
              showingCount={issuedFNF.pageRows.length}
              onPageChange={issuedFNF.setPage}
              onLimitChange={issuedFNF.setLimit}
            />
          </>
        ) : (
          <div className="py-8 text-center text-sm text-muted">No issued F&amp;F settlement letters yet.</div>
        )}
      </CardBody></Card>

      <FormDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Initiate exit" onSubmit={create} loading={busy} submitLabel="Initiate">
        <div className="space-y-3 py-1">
          <EmployeeSelect value={form.userId} onChange={(v) => setForm({ ...form, userId: v })} />
          <div className="grid grid-cols-2 gap-3">
            <TextField type="date" size="small" label="Resignation date" InputLabelProps={{ shrink: true }} value={form.resignationDate} onChange={(e) => setForm({ ...form, resignationDate: e.target.value })} />
            <TextField type="date" size="small" label="Last working day" InputLabelProps={{ shrink: true }} value={form.lastWorkingDay} onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })} />
          </div>
          <TextField size="small" fullWidth label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </FormDialog>

      <FormDialog open={Boolean(edit)} onClose={() => setEdit(null)} title="Manage exit" onSubmit={saveEdit} loading={busy} submitLabel="Save">
        {edit && (
          <div className="space-y-3 py-1">
            <TextField select size="small" fullWidth label="Status" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {['Initiated', 'InProgress', 'Completed'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField size="small" fullWidth multiline rows={2} label="Exit interview notes" value={edit.interviewNotes} onChange={(e) => setEdit({ ...edit, interviewNotes: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField size="small" label="F&F amount (₹)" type="number" value={edit.fnfRupees} onChange={(e) => setEdit({ ...edit, fnfRupees: e.target.value })} />
              <TextField select size="small" label="F&F status" value={edit.fnfStatus} onChange={(e) => setEdit({ ...edit, fnfStatus: e.target.value })}>
                {['Pending', 'Settled'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </div>
          </div>
        )}
      </FormDialog>

      <FormDialog open={Boolean(letterTarget)} onClose={() => setLetterTarget(null)} title="Issue F&F settlement" onSubmit={letters} loading={busy} submitLabel={previewUrl ? 'Confirm & send' : 'Issue letter'}>
        <div className="space-y-3 py-1">
          <TextField size="small" fullWidth label="F&F amount (₹)" type="number" value={fnfForm.amount} onChange={(e) => setFnfForm({ ...fnfForm, amount: e.target.value })} />
          <TextField type="date" size="small" label="Last working day" InputLabelProps={{ shrink: true }} value={fnfForm.lastWorkingDay} onChange={(e) => setFnfForm({ ...fnfForm, lastWorkingDay: e.target.value })} />
          <TextField size="small" fullWidth label="Settlement reason" value={fnfForm.reason} onChange={(e) => setFnfForm({ ...fnfForm, reason: e.target.value })} />

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={previewLetter} disabled={previewLoading}>
              {previewLoading ? 'Generating preview...' : 'Preview letter'}
            </Button>
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm font-medium text-primary-600 hover:underline">
                Open preview
              </a>
            )}
          </div>

          {previewUrl && (
            <div className="overflow-hidden rounded-lg border border-line bg-white">
              <div className="border-b border-line bg-surface px-3 py-2 text-sm font-medium text-ink">Settlement letter preview</div>
              <iframe title="F&F settlement preview" src={previewUrl} className="h-[420px] w-full bg-white" />
            </div>
          )}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete exit record?"
        confirmLabel="Delete"
        message="Only initiated exits without letters can be removed. This cannot be undone."
      />
    </div>
  );
}
