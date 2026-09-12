import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { UploadCloud, FileText, Eye, Trash2, FolderLock } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listMyDocuments, uploadDocument, deleteDocument, documentFileUrl } from '../../api/documents.js';
import { DOC_TYPES, DOC_TYPE_LABEL } from '../../config/constants.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

const fileIdOf = (doc) => doc.fileUrl?.split('/').pop()?.replace('.pdf', '');

export default function DocumentsPage() {
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const { data: docs, loading, error: listError, reload } = useAsync(() => listMyDocuments(), []);
  const [form, setForm] = useState({ documentType: 'PAN', documentName: '', documentNumber: '' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (listError) dispatch(notifyError(listError));
  }, [listError, dispatch]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return dispatch(notifyError('Please choose a PDF file.'));
    if (file.type !== 'application/pdf') return dispatch(notifyError('Only PDF files are accepted.'));
    if (file.size > 5 * 1024 * 1024) return dispatch(notifyError('File must be 5MB or smaller.'));
    setUploading(true);
    try {
      await uploadDocument({ file, ...form });
      dispatch(notifySuccess('Document uploaded for verification.'));
      setForm({ documentType: 'PAN', documentName: '', documentNumber: '' });
      setFile(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not upload document.'));
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async () => {
    const fileId = fileIdOf(deleteTarget);
    if (!fileId) {
      dispatch(notifyError('Could not delete document: invalid document id.'));
      return;
    }
    setDeleting(true);
    try {
      await deleteDocument(fileId);
      dispatch(notifySuccess('Document deleted.'));
      setDeleteTarget(null);
      reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not delete document.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Document Vault" subtitle="Securely upload your identity & verification documents" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upload */}
        <Card className="lg:col-span-1">
          <CardHeader title="Upload Document" />
          <CardBody>
            <form onSubmit={upload} className="space-y-4">
              <TextField select size="small" label="Document Type" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} fullWidth>
                {DOC_TYPES.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Document Name" placeholder="e.g. B.Tech Degree Certificate" value={form.documentName} onChange={(e) => setForm({ ...form, documentName: e.target.value })} fullWidth required />
              <TextField size="small" label="Document Reference Number" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} fullWidth required />
              <div onClick={() => fileRef.current?.click()} className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-line p-5 text-center hover:border-primary-300">
                <UploadCloud size={26} className="text-primary-500" />
                <p className="text-sm text-ink">{file ? file.name : 'Choose a PDF (max 5MB)'}</p>
                <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <Button type="submit" className="w-full" loading={uploading}>Save to Vault</Button>
            </form>
          </CardBody>
        </Card>

        {/* List */}
        <Card className="lg:col-span-2">
          <CardHeader title="My Documents" subtitle={`${docs?.length || 0} uploaded`} />
          <CardBody className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Spinner size={28} className="text-primary-600" /></div>
            ) : !docs?.length ? (
              <EmptyState icon={FolderLock} title="No documents yet" message="Upload your PAN, Aadhar or certificates to get verified by HR." />
            ) : (
              <ul className="divide-y divide-line">
                {docs.map((d) => {
                  const fid = fileIdOf(d);
                  return (
                    <li key={fid} className="flex items-center gap-3 px-5 py-3.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><FileText size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{d.documentName || DOC_TYPE_LABEL[d.documentType] || d.documentType}</p>
                        <p className="truncate text-xs text-muted">{DOC_TYPE_LABEL[d.documentType] || d.documentType} · Ref: {d.documentNumber}</p>
                      </div>
                      <StatusBadge status={d.verificationStatus?.toLowerCase()} />
                      <Tooltip title="View"><a className="btn-ghost p-2 text-primary-600" href={documentFileUrl(fid)} target="_blank" rel="noreferrer"><Eye size={16} /></a></Tooltip>
                      {d.verificationStatus !== 'Verified' && <Tooltip title="Delete"><button className="btn-ghost p-2 text-danger" onClick={() => setDeleteTarget(d)}><Trash2 size={16} /></button></Tooltip>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={onDelete} loading={deleting}
        title="Delete document?" confirmLabel="Delete" message="This permanently removes the file from your vault." />
    </div>
  );
}
