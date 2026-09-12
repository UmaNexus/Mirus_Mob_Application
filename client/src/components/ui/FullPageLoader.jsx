import Spinner from './Spinner.jsx';

export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface">
      <Spinner size={32} className="text-primary-600" />
      <p className="text-sm font-medium text-muted">{label}</p>
    </div>
  );
}
