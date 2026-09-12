import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Eraser, PenLine, ShieldCheck, FileText } from 'lucide-react';
import useAsync from '../../hooks/useAsync.js';
import { getOfferByToken, signOffer, candidateOfferPdfUrl } from '../../api/candidate.js';
import SignaturePad from '../../components/feature/SignaturePad.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import BrandLogo from '../../components/ui/BrandLogo.jsx';

function Branded({ children }) {
  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <BrandLogo variant="full" className="h-10" />
          <div className="leading-tight border-l border-line pl-3">
            <p className="text-sm font-semibold text-ink">Offer Letter</p>
            <p className="text-xs text-muted">Review the letter below and sign to accept</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

export default function CandidateOfferPage() {
  const { token } = useParams();
  const padRef = useRef(null);
  const { data, loading, error } = useAsync(() => getOfferByToken(token), [token]);
  const [empty, setEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  if (loading) {
    return (
      <Branded>
        <div className="flex justify-center py-20"><Spinner size={32} className="text-primary-600" /></div>
      </Branded>
    );
  }
  if (error) {
    return (
      <Branded>
        <div className="rounded-xl border border-danger/20 bg-danger-soft p-6 text-center text-danger">{error}</div>
      </Branded>
    );
  }

  if (result) {
    return (
      <Branded>
        <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="text-xl font-bold text-ink">Offer Signed</h2>
          <p className="mt-2 text-sm text-muted">
            Thank you — your signed offer letter has been recorded and is awaiting HR approval.
          </p>
          <p className="mt-4 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
            Once HR approves, login credentials will be emailed to{' '}
            <strong>{data?.offer?.candidateEmail}</strong>.
          </p>
        </div>
      </Branded>
    );
  }

  const { offer } = data;
  const alreadySigned = offer.status === 'signed' || offer.status === 'accepted';
  const pdfUrl = `${candidateOfferPdfUrl(token)}#view=FitH`;

  const accept = async () => {
    if (padRef.current?.isEmpty()) {
      alert('Please draw your signature first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await signOffer(token, padRef.current.toDataURL());
      setResult(res);
    } catch (err) {
      alert(err.uiMessage || 'Could not submit signature.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Branded>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">Dear {offer.fullName.split(' ')[0]},</h1>
        <p className="text-sm text-muted">
          Please review your <span className="font-semibold text-ink">Offer Letter</span> for{' '}
          <span className="font-semibold text-ink">{offer.position}</span> in the same format as issued,
          then sign below to accept.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
          <FileText size={16} className="text-primary-600" />
          <span className="text-sm font-semibold text-ink">Offer Letter (PDF)</span>
          <a
            className="ml-auto text-xs font-medium text-primary-600 hover:underline"
            href={candidateOfferPdfUrl(token)}
            target="_blank"
            rel="noreferrer"
          >
            Open in new tab
          </a>
        </div>
        <iframe
          title="Offer Letter PDF"
          src={pdfUrl}
          className="h-[min(72vh,780px)] w-full bg-slate-100"
        />
      </div>

      {!alreadySigned ? (
        <div className="mt-6 rounded-xl border border-line bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-ink">
            <PenLine size={18} className="text-primary-600" />
            <h3 className="text-base font-semibold">Acceptance of Offer — Sign here</h3>
          </div>
          <p className="mb-3 text-sm text-muted">
            I have read and understood the terms of the Offer and hereby accept the same.
            Your signature will be applied to the letter PDF.
          </p>
          <SignaturePad ref={padRef} height={160} onChange={setEmpty} />
          <button
            type="button"
            onClick={() => padRef.current?.clear()}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary-600"
          >
            <Eraser size={14} /> Clear
          </button>
          <Button className="mt-4 w-full sm:w-auto" onClick={accept} loading={submitting} disabled={empty}>
            <CheckCircle2 size={16} /> Accept &amp; Sign Offer Letter
          </Button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} /> Signature is cryptographically hashed and timestamped.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-line bg-white p-5 text-sm text-muted shadow-card">
          This offer has already been {offer.status}. The signed PDF is shown above when available.
        </div>
      )}
    </Branded>
  );
}
