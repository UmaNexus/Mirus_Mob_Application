import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle, Download } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { bulkUploadOffers } from '../../api/offers.js';
import { notifyError } from '../ui/toastSlice.js';

const SAMPLE_XLSX = '/samples/bulk-offers-sample.xlsx';

export default function BulkUploadDialog({ open, onClose, onDone }) {
  const dispatch = useDispatch();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => { setFile(null); setResult(null); setUploading(false); };
  const close = () => { reset(); onClose(); };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await bulkUploadOffers(file);
      setResult(res);
      onDone?.();
    } catch (err) {
      dispatch(notifyError(err.uiMessage));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Bulk Offer Ingestion</DialogTitle>
      <DialogContent dividers>
        {!result ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
              <div className="text-xs text-muted">
                <p className="font-medium text-ink">Need the Excel format?</p>
                <p>Columns: fullName, email, position, department, annualCTC, joiningDate, templateName</p>
              </div>
              <a
                href={SAMPLE_XLSX}
                download="bulk-offers-sample.xlsx"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-primary-700 shadow-sm hover:border-primary-300 hover:bg-primary-50"
              >
                <Download size={14} /> Download sample .xlsx
              </a>
            </div>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-line hover:border-primary-300'}`}
            >
              <UploadCloud size={36} className="text-primary-500" />
              <p className="text-sm font-medium text-ink">{file ? file.name : 'Drag & drop your roster.xlsx, or click to browse'}</p>
              <p className="text-xs text-muted">.xlsx · templateName must match an existing salary template</p>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            {file && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <FileSpreadsheet size={18} className="text-primary-600" /> {file.name}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="flex-1 rounded-lg bg-success-soft p-3 text-center"><p className="text-2xl font-bold text-success">{result.created.length}</p><p className="text-xs text-muted">Created</p></div>
              <div className="flex-1 rounded-lg bg-danger-soft p-3 text-center"><p className="text-2xl font-bold text-danger">{result.failed.length}</p><p className="text-xs text-muted">Failed</p></div>
            </div>
            <ul className="max-h-52 space-y-1 overflow-y-auto text-sm">
              {result.created.map((c) => <li key={`c${c.row}`} className="flex items-center gap-2 text-ink"><CheckCircle2 size={15} className="text-success" /> Row {c.row}: {c.email}</li>)}
              {result.failed.map((f) => <li key={`f${f.row}`} className="flex items-center gap-2 text-danger"><XCircle size={15} /> Row {f.row}: {f.error}</li>)}
            </ul>
          </div>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {!result ? (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={upload} loading={uploading} disabled={!file}>Ingest Roster</Button>
          </>
        ) : (
          <Button onClick={close}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
