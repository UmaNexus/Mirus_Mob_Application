import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { FileStack, Plus, Upload, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmployeeSelect from '../../components/feature/EmployeeSelect.jsx';
import JobRoleSelect from '../../components/feature/JobRoleSelect.jsx';
import CFIssuePanel from './CFIssuePanel.jsx';
import useAsync from '../../hooks/useAsync.js';
import { issueDocument } from '../../api/employeeDocs.js';
import { listTypes, createType, deleteType, uploadForEmployee } from '../../api/uploadedDocs.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const GEN_TYPES = [
  { value: 'AppointmentLetter', label: 'Appointment Letter' },
  { value: 'NDA', label: 'NDA / Confidentiality' },
  { value: 'Handbook', label: 'Employee Handbook' },
  { value: 'CodeOfConduct', label: 'Code of Conduct' }
];
const today = () => new Date().toISOString().slice(0, 10);

export default function DocCenterPage() {
  const dispatch = useDispatch();
  const types = useAsync(() => listTypes(), []);

  const [gen, setGen] = useState({
    userId: '', type: 'AppointmentLetter', effectiveDate: today(), designation: '', location: ''
  });
  const [genBusy, setGenBusy] = useState(false);

  const [typeOpen, setTypeOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', section: 'Tax', kind: 'read', termsText: '', fields: [] });
  const [typeBusy, setTypeBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [upload, setUpload] = useState({ userId: '', description: '', documentTypeId: '', file: null });
  const [upBusy, setUpBusy] = useState(false);

  useEffect(() => {
    if (types.error) dispatch(notifyError(types.error));
  }, [types.error, dispatch]);

  const doIssue = async () => {
    if (!gen.userId) return dispatch(notifyError('Select an employee.'));
    setGenBusy(true);
    try {
      const payload = {
        userId: gen.userId,
        type: gen.type,
        effectiveDate: gen.effectiveDate,
        designation: gen.designation
      };
      if (gen.type === 'AppointmentLetter' && String(gen.location || '').trim()) {
        payload.location = String(gen.location).trim();
      }
      await issueDocument(payload);
      dispatch(notifySuccess('Document issued.'));
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not issue document.'));
    } finally {
      setGenBusy(false);
    }
  };

  const saveType = async (e) => {
    e.preventDefault();
    setTypeBusy(true);
    try {
      await createType(typeForm);
      dispatch(notifySuccess('Document type created.'));
      setTypeOpen(false);
      setTypeForm({ name: '', section: 'Tax', kind: 'read', termsText: '', fields: [] });
      types.reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not create document type.'));
    } finally {
      setTypeBusy(false);
    }
  };

  const removeType = async () => {
    if (!deleteTarget?._id) return dispatch(notifyError('Could not delete document type.'));
    setDeleting(true);
    try {
      await deleteType(deleteTarget._id);
      dispatch(notifySuccess('Document type removed.'));
      setDeleteTarget(null);
      types.reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not delete document type.'));
    } finally {
      setDeleting(false);
    }
  };

  const doUpload = async () => {
    if (!upload.userId || !upload.description.trim() || !upload.file) {
      return dispatch(notifyError('Employee, description and PDF are required.'));
    }
    if (upload.file.type !== 'application/pdf') {
      return dispatch(notifyError('Only PDF files are accepted.'));
    }
    if (upload.file.size > 5 * 1024 * 1024) {
      return dispatch(notifyError('File must be 5MB or smaller.'));
    }
    setUpBusy(true);
    try {
      await uploadForEmployee({
        userId: upload.userId,
        description: upload.description.trim(),
        documentTypeId: upload.documentTypeId || undefined,
        file: upload.file
      });
      dispatch(notifySuccess('Document uploaded to employee.'));
      setUpload({ userId: '', description: '', documentTypeId: '', file: null });
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not upload document.'));
    } finally {
      setUpBusy(false);
    }
  };

  const addField = () => setTypeForm((f) => ({ ...f, fields: [...f.fields, { key: '', label: '', type: 'text', required: false }] }));
  const setField = (i, patch) => setTypeForm((f) => ({ ...f, fields: f.fields.map((x, idx) => idx === i ? { ...x, ...patch } : x) }));

  return (
    <div>
      <PageHeader title="Documents Center" subtitle="Issue sealed company documents, generate C&F agreements, and manage uploadable document types" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><FileStack size={18} className="text-primary-600" /> Issue a generated document</h3>
          <div className="space-y-3">
            <EmployeeSelect value={gen.userId} onChange={(v) => setGen({ ...gen, userId: v })} />
            <TextField select size="small" fullWidth label="Document" value={gen.type} onChange={(e) => setGen({ ...gen, type: e.target.value })}>
              {GEN_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            <div className="grid grid-cols-2 gap-3">
              <TextField type="date" size="small" label="Effective date" InputLabelProps={{ shrink: true }} value={gen.effectiveDate} onChange={(e) => setGen({ ...gen, effectiveDate: e.target.value })} />
              <JobRoleSelect value={gen.designation} onChange={(v) => setGen({ ...gen, designation: v })} />
            </div>
            {gen.type === 'AppointmentLetter' && (
              <TextField
                size="small"
                fullWidth
                label="Reporting area (optional)"
                placeholder="e.g. Nizamabad"
                value={gen.location}
                onChange={(e) => setGen({ ...gen, location: e.target.value })}
                helperText="Leave blank to omit the reporting-area line on the letter."
              />
            )}
            <Button onClick={doIssue} loading={genBusy}>Issue &amp; seal document</Button>
            <p className="text-xs text-muted">The company stamp &amp; authorized signature (from Company Settings) are printed on the PDF.</p>
          </div>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Upload a document to an employee</h3>
          <div className="space-y-3">
            <EmployeeSelect value={upload.userId} onChange={(v) => setUpload({ ...upload, userId: v })} />
            <TextField
              size="small"
              fullWidth
              required
              label="Description"
              placeholder="e.g. Form 16 FY 2025-26"
              value={upload.description}
              onChange={(e) => setUpload({ ...upload, description: e.target.value })}
            />
            <TextField select size="small" fullWidth label="Document type (optional)" value={upload.documentTypeId} onChange={(e) => setUpload({ ...upload, documentTypeId: e.target.value })}>
              <MenuItem value="">None — description only</MenuItem>
              {(types.data || []).map((t) => <MenuItem key={t._id} value={t._id}>{t.name} ({t.kind})</MenuItem>)}
            </TextField>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-primary-400">
              <Upload size={16} /> {upload.file ? upload.file.name : 'Choose a PDF (max 5MB)…'}
              <input type="file" accept="application/pdf" hidden onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] || null })} />
            </label>
            <p className="text-xs text-muted">Allowed: PDF only. Maximum size: 5MB. Description is shown to the employee.</p>
            <Button onClick={doUpload} loading={upBusy}>Upload &amp; assign</Button>
          </div>
        </CardBody></Card>
      </div>

      <CFIssuePanel />

      <Card className="mt-4"><CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Uploadable document types</h3>
          <Button size="sm" onClick={() => setTypeOpen(true)}><Plus size={14} /> New type</Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Name</th><th className="pb-2">Section</th><th className="pb-2">Mode</th><th className="pb-2">Fields</th><th className="pb-2 text-right" /></tr></thead>
          <tbody>
            {(types.data || []).map((t) => (
              <tr key={t._id} className="border-t border-line">
                <td className="py-2 font-medium text-ink">{t.name}</td>
                <td className="py-2 text-muted">{t.section}</td>
                <td className="py-2"><StatusBadge status={t.kind === 'write' ? 'processing' : 'pending'} label={t.kind} /></td>
                <td className="py-2 text-muted">{t.fields?.length || 0}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="btn-ghost p-1 text-danger"
                    onClick={() => setDeleteTarget(t)}
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {!types.data?.length && <tr><td colSpan={5} className="py-6 text-center text-muted">No document types yet.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeType}
        loading={deleting}
        title="Remove document type?"
        confirmLabel="Remove"
        message={deleteTarget ? `"${deleteTarget.name}" will be deactivated and hidden from this list.` : ''}
      />

      <FormDialog open={typeOpen} onClose={() => setTypeOpen(false)} title="New document type" onSubmit={saveType} loading={typeBusy} submitLabel="Create" maxWidth="md">
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <TextField size="small" label="Name (e.g. Form 16)" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} />
            <TextField size="small" label="Section (e.g. Tax)" value={typeForm.section} onChange={(e) => setTypeForm({ ...typeForm, section: e.target.value })} />
          </div>
          <TextField select size="small" fullWidth label="Interaction mode" value={typeForm.kind} onChange={(e) => setTypeForm({ ...typeForm, kind: e.target.value })}>
            <MenuItem value="read">Read — employee accepts terms</MenuItem>
            <MenuItem value="write">Write — employee fills PDF form fields</MenuItem>
          </TextField>
          {typeForm.kind === 'read'
            ? <TextField size="small" fullWidth multiline rows={2} label="Terms text" value={typeForm.termsText} onChange={(e) => setTypeForm({ ...typeForm, termsText: e.target.value })} />
            : (
              <div>
                <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-ink">Form fields (key must match the PDF's AcroForm field name)</span><Button size="sm" variant="secondary" onClick={addField}><Plus size={13} /> Add field</Button></div>
                {typeForm.fields.map((f, i) => (
                  <div key={i} className="mb-2 grid grid-cols-12 gap-2">
                    <TextField className="col-span-4" size="small" label="Field name (key)" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} sx={{ gridColumn: 'span 4' }} />
                    <TextField className="col-span-4" size="small" label="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} sx={{ gridColumn: 'span 4' }} />
                    <TextField select className="col-span-4" size="small" label="Type" value={f.type} onChange={(e) => setField(i, { type: e.target.value })} sx={{ gridColumn: 'span 4' }}>
                      {['text', 'number', 'date', 'checkbox'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </TextField>
                  </div>
                ))}
              </div>
            )}
        </div>
      </FormDialog>
    </div>
  );
}
