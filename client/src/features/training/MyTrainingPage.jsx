import { useDispatch } from 'react-redux';
import { GraduationCap, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import TrainingVideoPlayer from '../../components/feature/TrainingVideoPlayer.jsx';
import useAsync from '../../hooks/useAsync.js';
import { listSections, listMedia, mediaStreamUrl, setProgress, myProgress } from '../../api/training.js';
import { notifySuccess, notifyError } from '../ui/toastSlice.js';

export default function MyTrainingPage() {
  const dispatch = useDispatch();
  const sections = useAsync(listSections, []);
  const media = useAsync(() => listMedia(), []);
  const progress = useAsync(myProgress, []);

  const statusFor = (mediaId) => (progress.data || []).find((p) => String(p.mediaId) === String(mediaId))?.status;

  const complete = async (id) => {
    try { await setProgress(id, 'completed'); dispatch(notifySuccess('Marked complete.')); progress.reload(); }
    catch (err) { dispatch(notifyError(err.uiMessage)); }
  };

  const mediaBySection = (sectionId) => (media.data || []).filter((m) => String(m.sectionId) === String(sectionId));

  return (
    <div>
      <PageHeader title="Training" subtitle="Watch training videos and track your completion" />

      {!sections.data?.length && <Card><EmptyState icon={GraduationCap} title="No training yet" message="Training sections will appear here once published." /></Card>}

      {(sections.data || []).map((s) => (
        <Card key={s._id} className="mb-4"><CardBody>
          <h3 className="mb-1 text-base font-semibold text-ink">{s.title}</h3>
          {s.description && <p className="mb-3 text-sm text-muted">{s.description}</p>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {mediaBySection(s._id).map((m) => (
              <div key={m._id} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-ink">{m.title}</span>
                  {statusFor(m._id) === 'completed'
                    ? <span className="flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 size={14} /> Completed</span>
                    : <Button size="sm" variant="secondary" onClick={() => complete(m._id)}>Mark complete</Button>}
                </div>
                <TrainingVideoPlayer src={mediaStreamUrl(m._id)} title={m.title} />
                {m.description && <p className="mt-2 text-sm text-muted">{m.description}</p>}
              </div>
            ))}
            {!mediaBySection(s._id).length && <p className="text-sm text-muted">No videos in this section yet.</p>}
          </div>
        </CardBody></Card>
      ))}
    </div>
  );
}
