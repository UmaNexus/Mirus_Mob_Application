import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Lock, CheckCircle2 } from 'lucide-react';
import { setupPassword } from '../../api/candidate.js';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import BrandLogo from '../../components/ui/BrandLogo.jsx';

export default function SetupPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.password !== pw.confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      await setupPassword(token, pw.password);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err.uiMessage || 'Could not set password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-card">
        <div className="mb-6">
          <BrandLogo variant="full" className="h-9" />
        </div>

        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 size={30} /></div>
            <h2 className="text-lg font-bold text-ink">Password set!</h2>
            <p className="mt-1 text-sm text-muted">Redirecting you to sign in…</p>
            <Link to="/login" className="btn-primary mt-5 w-full">Go to login</Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-ink">Set your password</h2>
            <p className="mt-1 text-sm text-muted">Choose a new password for your employee account.</p>
            {error && <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</div>}
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Input id="password" type="password" label="New Password" icon={Lock} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} hint="Min 8 chars, with a letter and a number" required />
              <Input id="confirm" type="password" label="Confirm Password" icon={Lock} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
              <Button type="submit" className="w-full" loading={submitting}>Activate Account</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
