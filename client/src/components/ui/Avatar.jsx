import { cn } from '../../lib/cn.js';

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export default function Avatar({ src, name, size = 40, className }) {
  const dim = { width: size, height: size };
  if (src) {
    return <img src={src} alt={name} style={dim} className={cn('rounded-full object-cover ring-2 ring-white', className)} />;
  }
  return (
    <div
      style={{ ...dim, fontSize: size * 0.4 }}
      className={cn('flex items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 ring-2 ring-white', className)}
    >
      {initials(name)}
    </div>
  );
}
