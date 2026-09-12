import { Download } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import useAsync from '../../hooks/useAsync.js';
import { myReviews, myIncentives, myAppraisals, myTrainingRecords, incentiveAttachmentUrl, appraisalAttachmentUrl } from '../../api/performance.js';

const rupees = (p) => `INR ${((p || 0) / 100).toLocaleString('en-IN')}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const AttachmentLink = ({ fileId, url }) => fileId
  ? <a className="inline-flex items-center gap-1 text-primary-600 hover:underline" href={url} target="_blank" rel="noreferrer"><Download size={14} /> View</a>
  : <span className="text-muted">—</span>;

export default function MyPerformancePage() {
  const reviews = useAsync(myReviews, []);
  const incentives = useAsync(myIncentives, []);
  const appraisals = useAsync(myAppraisals, []);
  const training = useAsync(myTrainingRecords, []);

  return (
    <div>
      <PageHeader title="My Performance" subtitle="Your reviews, incentives and training" />

      <Card className="mb-4"><CardBody>
        <h3 className="mb-3 text-base font-semibold text-ink">Performance reviews</h3>
        {(reviews.data || []).map((r) => (
          <div key={r._id} className="mb-3 rounded-lg border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-ink">{r.period}</span>
              <span className="text-sm font-semibold text-primary-700">Rating: {r.overallRating}/5</span>
            </div>
            {r.comments && <p className="mt-1 text-sm text-muted">{r.comments}</p>}
            {(r.kpis || []).length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {r.kpis.map((k, i) => <li key={i} className="flex justify-between"><span className="text-muted">{k.title}</span><span className="text-ink">{k.achieved || '—'} / {k.target || '—'} · {k.score}/5</span></li>)}
              </ul>
            )}
          </div>
        ))}
        {!reviews.data?.length && <p className="py-4 text-center text-muted">No published reviews yet.</p>}
      </CardBody></Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Incentives</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="pb-2">Period</th><th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2">Attachment</th></tr></thead>
            <tbody>
              {(incentives.data || []).map((i) => (
                <tr key={i._id} className="border-t border-line"><td className="py-2">{i.period}</td><td className="py-2">{rupees(i.amount)}</td><td className="py-2"><StatusBadge status={i.status} /></td><td className="py-2"><AttachmentLink fileId={i.attachmentFileId} url={incentiveAttachmentUrl(i._id)} /></td></tr>
              ))}
              {!incentives.data?.length && <tr><td colSpan={4} className="py-4 text-center text-muted">No incentives.</td></tr>}
            </tbody>
          </table>
        </CardBody></Card>

        <Card><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Promotions</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="pb-2">Effective date</th><th className="pb-2">New designation</th><th className="pb-2">Attachment</th></tr></thead>
            <tbody>
              {(appraisals.data || []).map((a) => (
                <tr key={a._id} className="border-t border-line"><td className="py-2">{fmt(a.effectiveDate)}</td><td className="py-2">{a.newDesignation || '—'}</td><td className="py-2"><AttachmentLink fileId={a.attachmentFileId} url={appraisalAttachmentUrl(a._id)} /></td></tr>
              ))}
              {!appraisals.data?.length && <tr><td colSpan={3} className="py-4 text-center text-muted">No promotions yet.</td></tr>}
            </tbody>
          </table>
        </CardBody></Card>

        <Card className="lg:col-span-2"><CardBody>
          <h3 className="mb-3 text-base font-semibold text-ink">Training records</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="pb-2">Title</th><th className="pb-2">Completed</th><th className="pb-2">Status</th></tr></thead>
            <tbody>
              {(training.data || []).map((t) => (
                <tr key={t._id} className="border-t border-line"><td className="py-2">{t.title}</td><td className="py-2">{fmt(t.completedAt)}</td><td className="py-2"><StatusBadge status={t.status} /></td></tr>
              ))}
              {!training.data?.length && <tr><td colSpan={3} className="py-4 text-center text-muted">No training records.</td></tr>}
            </tbody>
          </table>
        </CardBody></Card>
      </div>
    </div>
  );
}
