import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import { Plus, Pencil, Trash2, FileText, Eye, Upload, Truck } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import useAsync from '../../hooks/useAsync.js';
import {
  listCFTemplates,
  createCFTemplate,
  updateCFTemplate,
  deleteCFTemplate,
  cfTemplateFileUrl,
  CF_TEMPLATE_TYPES,
  CF_TYPE_LABELS
} from '../../api/cfTemplates.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const emptyForm = (type) => ({
  _id: null,
  type,
  name: '',
  description: '',
  active: true,
  file: null,
  existingFileName: null
});

export default function CFTemplatesSection() {
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const { data, loading, reload } = useAsync(() => listCFTemplates(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;

  const templates = data?.data || [];
  const byType = (t) => templates.filter((x) => x.type === t);

  const openCreate = (type) => setForm(emptyForm(type));
  const openEdit = (t) => setForm({
    _id: t._id,
    type: t.type,
    name: t.name,
    description: t.description || '',
    active: t.active !== false,
    file: null,
    existingFileName: t.originalFileName || (t.hasFile ? 'Uploaded file' : null)
  });

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return dispatch(notifyError('Template name is required.'));

    setBusy(true);
    const fd = new FormData();
    fd.append('type', form.type);
    fd.append('name', form.name.trim());
    fd.append('description', form.description.trim());
    fd.append('active', String(form.active));
    if (form.file) fd.append('file', form.file);

    try {
      if (form._id) await updateCFTemplate(form._id, fd);
      else await createCFTemplate(fd);
      dispatch(notifySuccess('C&F template saved.'));
      setForm(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCFTemplate(deleteTarget._id);
      dispatch(notifySuccess('C&F template deleted.'));
      setDeleteTarget(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Manage Clearing &amp; Forwarding agreement templates by partner type. Seed defaults are available after setup; upload a PDF to customize. At issue time you only need party details — other blanks are prefilled.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {CF_TEMPLATE_TYPES.map((type) => (
          <Card key={type}>
            <CardBody>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <Truck size={18} className="text-primary-600" /> {CF_TYPE_LABELS[type]}
                </h3>
                <Button size="sm" variant="secondary" onClick={() => openCreate(type)}><Plus size={14} /> Add</Button>
              </div>
              <ul className="space-y-2">
                {byType(type).map((t) => (
                  <li key={t._id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span>{t.originalFileName || (t.hasFile ? 'File on file' : 'No file')}</span>
                          <StatusBadge status={t.active ? 'active' : 'inactive'} />
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        {t.hasFile && (
                          <a className="btn-ghost p-1.5 text-primary-600" href={cfTemplateFileUrl(t._id)} target="_blank" rel="noreferrer" title="View file">
                            <Eye size={14} />
                          </a>
                        )}
                        <button type="button" className="btn-ghost p-1.5" onClick={() => openEdit(t)} title="Edit"><Pencil size={14} /></button>
                        <button type="button" className="btn-ghost p-1.5 text-danger" onClick={() => setDeleteTarget(t)} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {t.description && <p className="mt-2 text-xs text-muted line-clamp-2">{t.description}</p>}
                  </li>
                ))}
                {!byType(type).length && (
                  <li className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted">
                    <FileText size={22} className="text-slate-300" />
                    No {CF_TYPE_LABELS[type]} templates yet.
                  </li>
                )}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      <FormDialog
        open={Boolean(form)}
        onClose={() => setForm(null)}
        maxWidth="sm"
        title={form?._id ? 'Edit C&F template' : `New ${form ? CF_TYPE_LABELS[form.type] : ''} template`}
        onSubmit={save}
        loading={busy}
        submitLabel="Save template"
      >
        {form && (
          <div className="space-y-3 py-1">
            <TextField
              size="small"
              fullWidth
              label="Template name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={form.type === 'CFAgent' ? 'e.g. C&F Agent Agreement' : 'e.g. Standard agreement'}
            />
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="rounded-lg border border-dashed border-line bg-surface p-4">
              <p className="mb-2 text-sm font-medium text-ink">Agreement file (PDF / Word)</p>
              {(form.file || form.existingFileName) && (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                  <FileText size={13} className="text-primary-600" />
                  {form.file?.name || form.existingFileName}
                  {form.file ? ' (new upload)' : ' (current)'}
                </p>
              )}
              <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> {form.file || form.existingFileName ? 'Replace file' : 'Choose file'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hidden
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              />
              <p className="mt-2 text-xs text-muted">Max 15 MB. Optional — without a file, the system generates a standard agreement from filled party details. Leave blank when editing to keep the existing file.</p>
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
        title="Delete C&F template?"
        confirmLabel="Delete"
        message={deleteTarget ? `"${deleteTarget.name}" and its uploaded file will be permanently removed.` : ''}
      />
    </div>
  );
}
