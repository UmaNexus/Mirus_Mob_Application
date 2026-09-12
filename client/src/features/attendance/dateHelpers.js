/** Date helpers for attendance month/week registers (local calendar). */

export const pad2 = (n) => String(n).padStart(2, '0');

export const toDateKey = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
};

export const startOfWeekMonday = (d = new Date()) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
};

export const addDays = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

/** Inclusive list of Date objects for a calendar month. */
export const daysOfMonth = (year, month /* 1-12 */) => {
  const out = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) out.push(new Date(year, month - 1, d));
  return out;
};

/** Monday–Sunday week containing `anchor`. */
export const daysOfWeek = (anchor = new Date()) => {
  const start = startOfWeekMonday(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export const monthLabel = (year, month) =>
  new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export const shortDay = (d) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' });

export const userDisplayName = (u) => {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  const n = `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim();
  return n || u.email || '—';
};

export const userIdOf = (rec) => {
  const u = rec?.userId;
  if (!u) return '';
  return typeof u === 'object' ? String(u._id) : String(u);
};
