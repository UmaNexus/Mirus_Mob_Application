import { Download, FileSignature, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import useAsync from '../../hooks/useAsync.js';
import { getMyOffer, myOfferPdfUrl } from '../../api/offers.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');

const Money = ({ rows, label }) => (
  <div>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex justify-between gap-3"><span className="text-muted">{r.label}</span><span className="font-medium text-ink">{r.display}</span></li>
      ))}
    </ul>
  </div>
);

export default function MyOfferPage() {
  const { data, loading, error } = useAsync(() => getMyOffer(), []);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>;

  if (error) {
    return (
      <div>
        <PageHeader title="Offer Letter" />
        <Card><EmptyState icon={FileSignature} title="No offer letter found" message={error} /></Card>
      </div>
    );
  }

  const { offer, compensation } = data;

  return (
    <div>
      <PageHeader
        title="Offer Letter"
        subtitle="Your employment offer and signed contract"
        actions={<a href={myOfferPdfUrl()} target="_blank" rel="noreferrer" className="btn-primary"><Download size={16} /> Download PDF</a>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Details + compensation */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Offer Details" action={<StatusBadge status={offer.status} />} />
            <CardBody>
              <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <dt className="text-muted">Position</dt><dd className="font-medium text-ink">{offer.position}</dd>
                <dt className="text-muted">Department</dt><dd className="font-medium text-ink">{offer.department}</dd>
                <dt className="text-muted">Offer Date</dt><dd className="font-medium text-ink">{fmtDate(offer.offerDate)}</dd>
                <dt className="text-muted">Joining Date</dt><dd className="font-medium text-ink">{fmtDate(offer.joiningDate)}</dd>
                {offer.acceptedAt && (<><dt className="text-muted">Accepted On</dt><dd className="font-medium text-ink">{fmtDate(offer.acceptedAt)}</dd></>)}
                {compensation && (<><dt className="text-muted">Annual CTC</dt><dd className="font-bold text-primary-700">{compensation.annualCTCDisplay}</dd></>)}
              </dl>
            </CardBody>
          </Card>

          {compensation && (
            <Card>
              <CardHeader title="Compensation Breakdown" subtitle="Monthly" />
              <CardBody>
                <div className="grid grid-cols-2 gap-6">
                  <Money label="Earnings" rows={compensation.earnings} />
                  <Money label="Deductions" rows={compensation.deductions} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-sm text-muted">Net Take-Home</span>
                  <span className="text-lg font-bold text-primary-700">{compensation.netTakeHomeDisplay}</span>
                </div>
              </CardBody>
            </Card>
          )}

          {offer.signedPdfFileUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
              <ShieldCheck size={18} /> Digitally signed &amp; verified{offer.acceptedAt ? ` on ${fmtDate(offer.acceptedAt)}` : ''}.
            </div>
          )}
        </div>

        {/* PDF preview */}
        <Card className="lg:col-span-3">
          <CardHeader title="Contract Document" subtitle={offer.signedPdfFileUrl ? 'Signed copy' : 'Draft copy'} />
          <CardBody className="p-0">
            <iframe title="Offer Letter" src={myOfferPdfUrl()} className="h-[640px] w-full rounded-b-xl border-0" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
