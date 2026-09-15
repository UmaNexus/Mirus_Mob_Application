/**
 * Shared date-range / "tour block" helpers for the Monthly Tour Plan screens.
 * A "block" is a pure UI/authoring concept — { id, startDate, endDate, area,
 * doctorIds } — that always gets flattened into individual { doctorId, date }
 * rows before it reaches the server; MonthlyTourPlan itself has no concept of
 * a range. Used by both MtpScreen (month view, aggregates blocks across every
 * tour plan in the month) and TourDetailScreen (builds/edits one tour's own
 * blocks).
 */

export const monthKey = (d) => d.toISOString().slice(0, 7);
export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const firstWeekdayMonFirst = (year, month) => (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

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
 * document actually stores. Consecutive dates carrying the EXACT SAME set of
 * doctors collapse into one block. `doctorArea(doctorId)` resolves a doctor's
 * area — pass a lookup into the BDM's own doctor list, or read straight off
 * an already-populated `v.doctorId.area` when the caller has that.
 */
export const blocksFromVisits = (visits, doctorArea) => {
  const byDate = new Map();
  visits.forEach((v) => {
    const doctorId = String(v.doctorId?._id || v.doctorId);
    const date = new Date(v.date).toISOString().slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date).add(doctorId);
  });
  const dates = [...byDate.keys()].sort();
  const blocks = [];
  let current = null;
  for (const date of dates) {
    const doctorIds = [...byDate.get(date)].sort();
    const key = doctorIds.join(',');
    if (current && current.key === key && addDays(current.endDate, 1) === date) {
      current.endDate = date;
    } else {
      if (current) blocks.push(current);
      const area = doctorArea(doctorIds[0]) || 'Unassigned area';
      current = { id: `existing_${date}_${key}`, startDate: date, endDate: date, area, doctorIds, key };
    }
  }
  if (current) blocks.push(current);
  return blocks;
};

/** A lookup usable with blocksFromVisits' `doctorArea` param, built from an already-populated plannedVisits array. */
export const areaLookupFromPopulatedVisits = (visits) => {
  const map = new Map();
  visits.forEach((v) => {
    if (v.doctorId && typeof v.doctorId === 'object') map.set(String(v.doctorId._id), v.doctorId.area);
  });
  return (doctorId) => map.get(doctorId);
};

export const flattenBlocks = (blocks) => {
  const visits = [];
  blocks.forEach((b) => {
    datesBetween(b.startDate, b.endDate).forEach((date) => {
      b.doctorIds.forEach((doctorId) => visits.push({ doctorId, date }));
    });
  });
  return visits;
};
