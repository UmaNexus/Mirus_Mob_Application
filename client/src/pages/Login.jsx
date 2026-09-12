import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Navigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Building2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import BrandLogo from '../components/ui/BrandLogo.jsx';
import { APP_NAME, COMPANY_CODE, COMPANY_NAME } from '../config/brand.js';
import { login, selectAuth } from '../features/auth/authSlice.js';

// Remember the last company code so returning users don't retype it.
const LAST_SLUG_KEY = 'hrms_last_company';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { status, error } = useSelector(selectAuth);
  const [form, setForm] = useState({
    companySlug: localStorage.getItem(LAST_SLUG_KEY) || COMPANY_CODE,
    identifier: '',
    password: ''
  });
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const companyError = touched.companySlug && !form.companySlug.trim() ? 'Company code is required' : '';
  const identifierError = touched.identifier && !form.identifier.trim()
    ? 'Email or Employee ID is required'
    : '';
  const pwError = touched.password && !form.password ? 'Password is required' : '';

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched({ companySlug: true, identifier: true, password: true });
    if (!form.companySlug.trim() || !form.identifier.trim() || !form.password) return;
    setSubmitting(true);
    const payload = {
      companySlug: form.companySlug.trim().toLowerCase(),
      identifier: form.identifier.trim(),
      // Keep email for backward-compatible API clients / older servers.
      email: form.identifier.trim(),
      password: form.password
    };
    const res = await dispatch(login(payload));
    setSubmitting(false);
    if (login.fulfilled.match(res)) {
      localStorage.setItem(LAST_SLUG_KEY, payload.companySlug);
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel (desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="relative">
          <BrandLogo variant="mark" on="dark" markClassName="h-11 w-11 rounded-xl bg-white p-1.5" className="gap-3" />
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight">Manage your<br />workforce, end&#8209;to&#8209;end.</h1>
          <p className="mt-4 max-w-md text-primary-100/80">
            Onboarding, dynamic offer letters with e&#8209;signatures, a secure document vault and automated payslips — all in one place.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-primary-100/70">
          <ShieldCheck size={18} /> Enterprise-grade security · JWT protected
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-surface px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo variant="full" className="h-10" />
          </div>

          <h2 className="text-2xl font-bold text-ink">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Sign in to your {APP_NAME} portal.</p>

          {error && (
            <div className="mt-5 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              id="companySlug" type="text" label="Company code" placeholder={COMPANY_CODE} icon={Building2}
              value={form.companySlug}
              onChange={(e) => setForm({ ...form, companySlug: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, companySlug: true }))}
              error={companyError} autoComplete="organization" autoFocus
            />
            <Input
              id="identifier" type="text" label="Email or Employee ID" placeholder="you@mirus.com or MMS45872" icon={Mail}
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, identifier: true }))}
              error={identifierError} autoComplete="username"
            />
            <div>
              <Input
                id="password" type={showPw ? 'text' : 'password'} label="Password" placeholder="••••••••" icon={Lock}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={pwError} autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPw((s) => !s)}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary-600">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />} {showPw ? 'Hide' : 'Show'} password
              </button>
            </div>

            <Button type="submit" className="w-full" loading={submitting}>Sign in</Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted">© 2026 {COMPANY_NAME}</p>
        </div>
      </div>
    </div>
  );
}
