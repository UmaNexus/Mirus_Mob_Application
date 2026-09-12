import { useState } from 'react';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import { Plus, Upload, GraduationCap, Trash2, Play, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import TrainingVideoPlayer from '../../components/feature/TrainingVideoPlayer.jsx';
import useAsync from '../../hooks/useAsync.js';
import {
  listSections, createSection, deleteSection, listMedia, uploadMedia, deleteMedia, mediaStreamUrl
} from '../../api/training.js';
import {
  MAX_TRAINING_VIDEO_MB,
  MAX_TRAINING_VIDEO_BYTES,
  TRAINING_VIDEO_ACCEPT,
  TRAINING_VIDEO_FORMAT_LABEL,
  isAllowedTrainingVideo
} from '../../config/trainingUpload.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function TrainingAdminPage() {
  const dispatch = useDispatch();
  const sections = useAsync(listSections, []);
  const media = useAsync(() => listMedia(), []);
  const [sec, setSec] = useState({ title: '', description: '' });
  const [up, setUp] = useState({ sectionId: '', title: '', description: '', file: null });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState(null); // { _id, title }

  const saveSection = async () => {
    if (!sec.title) return dispatch(notifyError('Enter a section title.'));
    try { await createSection(sec); dispatch(notifySuccess('Section created.')); setSec({ title: '', description: '' }); sections.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage || 'Could not create section.')); }
  };
  const doUpload = async () => {
    if (!up.sectionId || !up.title || !up.file) {
      return dispatch(notifyError('Section, title and video are required.'));
    }
    if (!isAllowedTrainingVideo(up.file)) {
      return dispatch(notifyError(`Video must be ${TRAINING_VIDEO_FORMAT_LABEL}.`));
    }
    if (up.file.size > MAX_TRAINING_VIDEO_BYTES) {
      return dispatch(notifyError(`Video must be ${MAX_TRAINING_VIDEO_MB}MB or smaller.`));
    }
    setBusy(true);
    try {
      await uploadMedia(up);
      dispatch(notifySuccess('Video uploaded.'));
      setUp({ sectionId: '', title: '', description: '', file: null });
      media.reload();
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Video upload failed.'));
    } finally {
      setBusy(false);
    }
  };

  const count = (sectionId) => (media.data || []).filter((m) => String(m.sectionId?._id || m.sectionId) === String(sectionId)).length;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'section') {
        await deleteSection(deleteTarget._id);
        dispatch(notifySuccess('Section deleted.'));
        sections.reload();
        media.reload();
      } else {
        await deleteMedia(deleteTarget._id);
        dispatch(notifySuccess('Video deleted.'));
        media.reload();
      }
      setDeleteTarget(null);
    } catch (err) {
      dispatch(notifyError(err.uiMessage || 'Could not delete.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Training Library" subtitle="Organize training videos into sections" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><GraduationCap size={18} className="text-primary-600" /> Sections</h3>
          <div className="mb-3 flex items-end gap-2">
            <TextField size="small" label="Section title" value={sec.title} onChange={(e) => setSec({ ...sec, title: e.target.value })} />
            <Button size="sm" onClick={saveSection}><Plus size={14} /> Add</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {(sections.data || []).map((s) => (
              <li key={s._id} className="flex items-center justify-between gap-2 border-t border-line py-2">
                <span className="font-medium text-ink">{s.title}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{count(s._id)} video(s)</span>
                  <button type="button" className="btn-ghost p-1 text-danger" onClick={() => setDeleteTarget({ kind: 'section', _id: s._id, label: s.title })} aria-label={`Delete ${s.title}`}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
            {!sections.data?.length && <li className="py-4 text-center text-muted">No sections yet.</li>}
          </ul>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Upload a training video</h3>
          <div className="space-y-3">
            <TextField select size="small" fullWidth label="Section" value={up.sectionId} onChange={(e) => setUp({ ...up, sectionId: e.target.value })}>
              <MenuItem value="">Select…</MenuItem>
              {(sections.data || []).map((s) => <MenuItem key={s._id} value={s._id}>{s.title}</MenuItem>)}
            </TextField>
            <TextField size="small" fullWidth label="Video title" value={up.title} onChange={(e) => setUp({ ...up, title: e.target.value })} />
            <TextField size="small" fullWidth label="Description" value={up.description} onChange={(e) => setUp({ ...up, description: e.target.value })} />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-primary-400">
              <Upload size={16} /> {up.file ? up.file.name : `Choose a video (${TRAINING_VIDEO_FORMAT_LABEL}, max ${MAX_TRAINING_VIDEO_MB}MB)…`}
              <input
                type="file"
                accept={TRAINING_VIDEO_ACCEPT}
                hidden
                onChange={(e) => setUp({ ...up, file: e.target.files?.[0] || null })}
              />
            </label>
            <p className="text-xs text-muted">
              Allowed: {TRAINING_VIDEO_FORMAT_LABEL}. Maximum size: {MAX_TRAINING_VIDEO_MB}MB.
            </p>
            <Button onClick={doUpload} loading={busy}>Upload video</Button>
          </div>
        </CardBody></Card>
      </div>

      <Card className="mt-4"><CardBody>
        <h3 className="mb-3 text-base font-semibold text-ink">Uploaded videos</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-2">Title</th>
              <th className="pb-2">Section</th>
              <th className="pb-2 text-center">Play</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(media.data || []).map((m) => {
              const sid = m.sectionId?._id || m.sectionId;
              const sectionTitle = m.sectionId?.title
                || (sections.data || []).find((s) => String(s._id) === String(sid))?.title
                || '—';
              return (
                <tr key={m._id} className="border-t border-line">
                  <td className="py-2 font-medium text-ink">{m.title}</td>
                  <td className="py-2 text-muted">{sectionTitle}</td>
                  <td className="py-2 text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
                      onClick={() => setPreview({ _id: m._id, title: m.title })}
                      aria-label={`Play ${m.title}`}
                    >
                      <Play size={14} fill="currentColor" /> Play
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" className="btn-ghost p-1 text-danger" onClick={() => setDeleteTarget({ kind: 'media', _id: m._id, label: m.title })} aria-label={`Delete ${m.title}`}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!media.data?.length && <tr><td colSpan={4} className="py-6 text-center text-muted">No videos uploaded yet.</td></tr>}
          </tbody>
        </table>
      </CardBody></Card>

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ pr: 6, fontWeight: 700 }}>
          {preview?.title || 'Training video'}
          <IconButton
            onClick={() => setPreview(null)}
            sx={{ position: 'absolute', right: 12, top: 12 }}
            size="small"
            aria-label="Close player"
          >
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#0f0f0f', p: 2 }}>
          {preview?._id && (
            <TrainingVideoPlayer
              key={preview._id}
              src={mediaStreamUrl(preview._id)}
              title={preview.title}
              autoPlay
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={deleteTarget?.kind === 'section' ? 'Delete section?' : 'Delete video?'}
        confirmLabel="Delete"
        message={
          deleteTarget?.kind === 'section'
            ? `"${deleteTarget.label}" and all of its videos will be removed.`
            : deleteTarget
              ? `"${deleteTarget.label}" will be permanently removed.`
              : ''
        }
      />
    </div>
  );
}
