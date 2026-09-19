/**
 * Shared date-range / "tour block" helpers for the Monthly Tour Plan screens.
 * A "block" is a pure UI/authoring concept — { id, startDate, endDate, area }
 * — that always gets flattened into individual { area, date } rows before it
 * reaches the server; MonthlyTourPlan itself has no concept of a range. Used
 * by both MtpScreen (month view, aggregates blocks across every tour plan in
 * the month) and TourDetailScreen (builds/edits one tour's own blocks).
 *
 * MTP plans WHERE the BDM will work (date + area) — never WHICH doctors,
 * so a block has no doctor list; doctor-level planning happens later via
 * Today's Work Type/DCR.
 */

export const monthKey = (d) => d.toISOString().slice(0, 7);
export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const firstWeekdayMonFirst = (year, month) => (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

export const isWeekend = (dateKey) => {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

export const monthLabel = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const shortDate = (dateKey) => {
  const [, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export const rangeLabel = (start, end) => (start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`);

export const addDays = (dateKey, n) => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const datesBetween = (from, to) => {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const dates = [];
  let cursor = start;
  while (cursor <= end && dates.length < 31) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
};

/**
 * Rebuild block-shaped ranges from the flat `plannedVisits` a MonthlyTourPlan
 * document actually stores. Consecutive dates carrying the same area
 * collapse into one block. Falls back to a legacy record's populated
 * `v.doctorId.area` when `v.area` itself is missing (a plan written before
 * this change, back when MTP was doctor-based) — reconstructed from real
 * stored data, never invented.
 */
export const blocksFromVisits = (visits) => {
  const byDate = new Map();
  visits.forEach((v) => {
    const date = new Date(v.date).toISOString().slice(0, 10);
    const legacyArea = v.doctorId && typeof v.doctorId === 'object' ? v.doctorId.area : null;
    byDate.set(date, v.area || legacyArea || 'Unknown area');
  });
  const dates = [...byDate.keys()].sort();
  const blocks = [];
  let current = null;
  for (const date of dates) {
    const area = byDate.get(date);
    if (current && current.area === area && addDays(current.endDate, 1) === date) {
      current.endDate = date;
    } else {
      if (current) blocks.push(current);
      current = { id: `existing_${date}`, startDate: date, endDate: date, area };
    }
  }
  if (current) blocks.push(current);
  return blocks;
};

export const flattenBlocks = (blocks) => {
  const visits = [];
  blocks.forEach((b) => {
    datesBetween(b.startDate, b.endDate).forEach((date) => visits.push({ area: b.area, date }));
  });
  return visits;
};
