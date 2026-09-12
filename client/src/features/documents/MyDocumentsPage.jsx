import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import { FileSignature, Eye, PenLine, Eraser, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import FormDialog from '../../components/ui/FormDialog.jsx';
import SignaturePad from '../../components/feature/SignaturePad.jsx';
import useAsync from '../../hooks/useAsync.js';
import { myDocuments, acknowledgeDocument, employeeDocPdfUrl } from '../../api/employeeDocs.js';
import { myRecords, acceptRecord, fillRecord, recordPdfUrl } from '../../api/uploadedDocs.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function MyDocumentsPage() {
  const dispatch = useDispatch();
  const gen = useAsync(myDocuments, []);
  const rec = useAsync(myRecords, []);
  const padRef = useRef(null);
  const [signDoc, setSignDoc] = useState(null);
  const [fillRec, setFillRec] = useState(null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  const agree = async (doc) => {
    try { await acknowledgeDocument(doc._id, { agree: true }); dispatch(notifySuccess('Acknowledged.')); gen.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage || 'Could not acknowledge document.')); }
  };
  const sign = async () => {
    if (padRef.current?.isEmpty()) return dispatch(notifyError('Please draw your signature.'));
    setBusy(true);
    try { await acknowledgeDocument(signDoc._id, { signatureBase64: padRef.current.toDataURL() }); dispatch(notifySuccess('Signed.')); setSignDoc(null); gen.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage || 'Could not sign document.')); }
    finally { setBusy(false); }
  };
  const accept = async (r) => {
    try { await acceptRecord(r._id); dispatch(notifySuccess('Confirmed.')); rec.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage || 'Could not confirm document.')); }
  };
  const openFill = (r) => { setFillRec(r); setValues({}); };
  const submitFill = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await fillRecord(fillRec._id, values); dispatch(notifySuccess('Submitted.')); setFillRec(null); rec.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage || 'Could not submit document.')); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="My Documents" subtitle="Review, acknowledge, sign or fill your company documents" />

      <Card className="mb-4"><CardBody>
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><FileSignature size={18} className="text-primary-600" /> Company documents</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Document</th><th className="pb-2">Status</th><th className="pb-2 text-right">Action</th></tr></thead>
          <tbody>
            {(gen.data || []).map((d) => (
              <tr key={d._id} className="border-t border-line">
                <td className="py-2 font-medium text-ink">{d.title}</td>
                <td className="py-2"><StatusBadge status={d.status} /></td>
                <td className="py-2">
                  <div className="flex justify-end gap-1">
                    <a className="btn-ghost p-1.5 text-primary-600" href={employeeDocPdfUrl(d._id)} target="_blank" rel="noreferrer"><Eye size={16} /></a>
                    {d.status === 'issued' && (d.requiresSignature
                      ? <Button size="sm" onClick={() => setSignDoc(d)}>Sign</Button>
                      : <Button size="sm" onClick={() => agree(d)}>Agree</Button>)}
                  </div>
                </td>
              </tr>
            ))}
            {!gen.data?.length && <tr><td colSpan={3} className="py-6 text-center text-muted">No documents issued yet.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

      <Card><CardBody>
        <h3 className="mb-3 text-base font-semibold text-ink">Uploaded documents (Form 16, policies…)</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="pb-2">Section</th><th className="pb-2">Document</th><th className="pb-2">Mode</th><th className="pb-2">Status</th><th className="pb-2 text-right">Action</th></tr></thead>
          <tbody>
            {(rec.data || []).map((r) => (
              <tr key={r._id} className="border-t border-line">
                <td className="py-2 text-muted">{r.section}</td>
                <td className="py-2 font-medium text-ink">{r.description || r.documentTypeId?.name || '—'}</td>
                <td className="py-2 capitalize">{r.accessMode}</td>
                <td className="py-2"><StatusBadge status={r.status} /></td>
                <td className="py-2">
                  <div className="flex justify-end gap-1">
                    <a className="btn-ghost p-1.5 text-primary-600" href={recordPdfUrl(r._id)} target="_blank" rel="noreferrer"><Eye size={16} /></a>
                    {r.status === 'pending' && (r.accessMode === 'read'
                      ? <Button size="sm" onClick={() => accept(r)}>Agree &amp; confirm</Button>
                      : <Button size="sm" onClick={() => openFill(r)}>Fill</Button>)}
                  </div>
                </td>
              </tr>
            ))}
            {!rec.data?.length && <tr><td colSpan={5} className="py-6 text-center text-muted">No uploaded documents.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

      {/* Counter-sign dialog */}
      <FormDialog open={Boolean(signDoc)} onClose={() => setSignDoc(null)} title={`Sign — ${signDoc?.title || ''}`}
        onSubmit={(e) => { e.preventDefault(); sign(); }} loading={busy} submitLabel="Submit signature">
        <div className="py-1">
          <div className="mb-2 flex items-center gap-2 text-ink"><PenLine size={16} className="text-primary-600" /> Draw your signature</div>
          <SignaturePad ref={padRef} height={160} />
          <button type="button" onClick={() => padRef.current?.clear()} className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-primary-600"><Eraser size={13} /> Clear</button>
        </div>
      </FormDialog>

      {/* Write-mode fill dialog */}
      <FormDialog open={Boolean(fillRec)} onClose={() => setFillRec(null)} title={`Fill — ${fillRec?.description || fillRec?.documentTypeId?.name || ''}`}
        onSubmit={submitFill} loading={busy} submitLabel="Submit">
        <div className="space-y-3 py-1">
          <p className="flex items-center gap-1.5 text-xs text-muted"><CheckCircle2 size={13} /> Enter values for the form fields; they will be written into the PDF.</p>
          {(fillRec?.documentTypeId?.fields || []).map((f) => (
            <TextField key={f.key} fullWidth size="small" label={f.label + (f.required ? ' *' : '')}
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              InputLabelProps={f.type === 'date' ? { shrink: true } : undefined}
              value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
          ))}
          {!fillRec?.documentTypeId?.fields?.length && <p className="text-sm text-muted">This document type has no defined fields.</p>}
        </div>
      </FormDialog>
    </div>
  );
}
