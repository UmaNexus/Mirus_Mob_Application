/**
 * Parse Mirus-style monthly staff attendance workbooks (.xls / .xlsx).
 *
 * Layout (per sheet):
 *   R1  Title (optional) e.g. "MONTH OF JULY 2026"
 *   R2  Headers: S.No. | Emp.Id | Name | Contact No. | weekday shorts (WED, THUR…) | PD | AD | TD
 *   R3  Day-of-month numbers under the weekday columns (1..31)
 *   R4+ Employee rows with P / A / L / empty per day
 *
 * Month/year resolution (when UI does not override):
 *   1) Sheet tab — e.g. JULY, july-2026, July_2026
 *   2) Sheet body — Month/Year columns or title text
 *   3) Tab month-only + year from body
 *
 * Empty / blank-like day cells are omitted (not imported — attendance left unchanged).
 * Sunday columns and calendar Sundays are blocked (never imported).
 */

import * as XLSX from 'xlsx';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12
};

const MONTH_NAME_RE = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const WEEKDAY_RE = /^(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\.?$/i;

/** Header token → JS getUTCDay() (0=Sun … 6=Sat). */
const WEEKDAY_UTC = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  TUES: 2,
  WED: 3,
  THU: 4,
  THUR: 4,
  THURS: 4,
  FRI: 5,
  SAT: 6
};

const STATUS_MAP = {
  P: 'Present',
  A: 'Absent',
  L: 'Leave'
};

/** Cell values that mean "no mark" — do not create/update attendance. */
const EMPTY_MARK_RE = /^(?:|-|\.|—|–|na|n\/?a|nil|null|none|#n\/?a)$/i;

const norm = (v) => String(v ?? '').trim();
const normUpper = (v) => norm(v).toUpperCase();
const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');

const cellStr = (row, idx) => {
  if (!row || idx == null || idx < 0) return '';
  const v = row[idx];
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  return String(v).trim();
};

const isEmptyMark = (raw) => {
  const s = norm(raw);
  if (!s) return true;
  return EMPTY_MARK_RE.test(s);
};

const weekdayToken = (hdr) => {
  const t = normUpper(hdr).replace(/\./g, '');
  return WEEKDAY_UTC[t] != null ? t : null;
};

const normalizeYear = (y) => {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n >= 2000 && n <= 2100) return n;
  if (n >= 0 && n <= 99) return 2000 + n;
  return null;
};

const monthFromToken = (token) => {
  const t = norm(token).toLowerCase().replace(/\./g, '');
  return MONTHS[t] || null;
};

/** Parse tab names like JULY, july-2026, July_2026, JUL-26. */
export const parseTabMonthYear = (sheetName) => {
  const raw = norm(sheetName);
  if (!raw) return { month: null, year: null };

  const compact = raw.toLowerCase().replace(/[_\s]+/g, '-');
  const withYear = compact.match(new RegExp(`^(${MONTH_NAME_RE})-(\\d{2,4})$`, 'i'));
  if (withYear) {
    return { month: monthFromToken(withYear[1]), year: normalizeYear(withYear[2]) };
  }

  const onlyMonth = monthFromToken(compact.replace(/-/g, ''));
  if (onlyMonth) return { month: onlyMonth, year: null };

  // Loose: "JULY 2026" / "attendance july-2026"
  const loose = raw.match(new RegExp(`\\b(${MONTH_NAME_RE})\\b[\\s,_-]*(\\d{2,4})?`, 'i'));
  if (loose) {
    return {
      month: monthFromToken(loose[1]),
      year: loose[2] ? normalizeYear(loose[2]) : null
    };
  }
  return { month: null, year: null };
};

/** Scan title + early rows for Month / Year labels or "MONTH OF …" text. */
export const parseBodyMonthYear = (rows) => {
  let month = null;
  let year = null;
  const scanRows = (rows || []).slice(0, 6);

  for (const row of scanRows) {
    const cells = (row || []).map((c) => norm(c));
    for (let i = 0; i < cells.length; i += 1) {
      const c = cells[i];
      const cl = c.toLowerCase();

      if (/^month$/.test(cl) || /^month\s*:?$/.test(cl)) {
        const next = cells[i + 1] || '';
        const m = monthFromToken(next) || monthFromToken(next.replace(/\d/g, ''));
        const y = normalizeYear((next.match(/\d{2,4}/) || [])[0])
          || normalizeYear(cells[i + 2]);
        if (m) month = month || m;
        if (y) year = year || y;
      }
      if (/^year$/.test(cl) || /^year\s*:?$/.test(cl)) {
        const y = normalizeYear(cells[i + 1]) || normalizeYear(c.match(/\d{4}/)?.[0]);
        if (y) year = year || y;
      }

      const m1 = c.match(new RegExp(`month\\s+of\\s+(${MONTH_NAME_RE})\\s+(\\d{4})`, 'i'));
      if (m1) {
        month = month || monthFromToken(m1[1]);
        year = year || normalizeYear(m1[2]);
      }
      const m2 = c.match(new RegExp(`\\b(${MONTH_NAME_RE})\\b[\\s,_-]*(\\d{4})\\b`, 'i'));
      if (m2) {
        month = month || monthFromToken(m2[1]);
        year = year || normalizeYear(m2[2]);
      }
      if (!year) {
        const yOnly = c.match(/\b(20\d{2})\b/);
        if (yOnly) year = normalizeYear(yOnly[1]);
      }
    }
  }
  return { month, year };
};

/**
 * Resolve month/year. UI override wins when provided.
 * @param {{ month?: number, year?: number }} override
 */
export const resolveSheetMonthYear = (sheetName, rows, override = {}) => {
  const uiMonth = override.month ? Number(override.month) : null;
  const uiYear = override.year ? Number(override.year) : null;
  if (uiMonth >= 1 && uiMonth <= 12 && uiYear >= 2000) {
    return { month: uiMonth, year: uiYear, source: 'ui' };
  }

  const fromTab = parseTabMonthYear(sheetName);
  const fromBody = parseBodyMonthYear(rows);
  const month = fromTab.month || fromBody.month || null;
  const year = fromTab.year || fromBody.year || null;
  if (month && year) {
    return {
      month,
      year,
      source: fromTab.month && fromTab.year ? 'tab' : (fromTab.month ? 'tab+body' : 'body')
    };
  }
  return { month, year, source: null };
};

/** True when a sheet looks like the Mirus staff attendance matrix. */
export const isMirusAttendanceSheet = (rows, { minDays = 1 } = {}) => {
  if (!Array.isArray(rows) || rows.length < 4) return false;
  const header = (rows[1] || []).map((c) => norm(c).toLowerCase());
  const hasEmp = header.some((h) => /emp\.?\s*id|employee\s*id/.test(h));
  const hasName = header.some((h) => /name/.test(h));
  const dayRow = rows[2] || [];
  const dayNums = dayRow.filter((c) => {
    const n = Number(c);
    return Number.isInteger(n) && n >= 1 && n <= 31;
  });
  return hasEmp && hasName && dayNums.length >= minDays;
};

const findCol = (headerRow, predicators) => {
  for (let i = 0; i < headerRow.length; i += 1) {
    const h = norm(headerRow[i]).toLowerCase();
    if (predicators.some((re) => re.test(h))) return i;
  }
  return -1;
};

const isWeekdayHeader = (hdr) => WEEKDAY_RE.test(norm(hdr));

/**
 * Parse one Mirus matrix sheet into attendance marks.
 * @param {object} [options]
 * @param {number} [options.month] UI month override 1-12
 * @param {number} [options.year] UI year override
 * @param {number} [options.onlyDay] If set, only import that day-of-month column
 */
export const parseMirusAttendanceSheet = (rows, sheetName = '', options = {}) => {
  const marks = [];
  const errors = [];
  let skippedEmpty = 0;
  let skippedSunday = 0;

  if (!isMirusAttendanceSheet(rows, { minDays: 1 })) {
    return {
      marks,
      skippedEmpty,
      skippedSunday,
      errors: [{ sheet: sheetName, error: 'Not a Mirus attendance sheet' }],
      meta: null
    };
  }

  const header = rows[1] || [];
  const dayRow = rows[2] || [];
  const resolved = resolveSheetMonthYear(sheetName, rows, options);
  const { month, year } = resolved;
  if (!month || !year) {
    errors.push({
      sheet: sheetName,
      error: 'Could not determine month/year. Select month & year in the UI, or name the tab like july-2026.'
    });
    return { marks, skippedEmpty, skippedSunday, errors, meta: null };
  }

  const empCol = findCol(header, [/^emp\.?\s*id$/, /employee\s*id/, /^emp\s*id/]);
  const nameCol = findCol(header, [/name of the employee/, /^name$/, /employee\s*name/]);
  const phoneCol = findCol(header, [/contact/, /phone/, /mobile/]);

  if (empCol < 0) {
    errors.push({ sheet: sheetName, error: 'Emp.Id column not found' });
    return { marks, skippedEmpty, skippedSunday, errors, meta: null };
  }

  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const onlyDay = options.onlyDay != null ? Number(options.onlyDay) : null;

  // R2 = weekday short form, R3 = date (day of month) under it
  const dayCols = [];
  for (let c = 0; c < Math.max(dayRow.length, header.length); c += 1) {
    const hdr = norm(header[c]).toUpperCase();
    if (['PD', 'AD', 'TD', 'S.NO.', 'S.NO', 'EMP.ID', 'NAME', 'CONTACT NO.', 'CONTACT NO'].includes(hdr)) continue;
    if (/present|absent|total|contact|phone|name|emp|s\.?\s*no/i.test(hdr) && !isWeekdayHeader(hdr)) continue;

    const day = Number(dayRow[c]);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    if (day > dim) continue;
    if (onlyDay != null && day !== onlyDay) continue;

    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const utcDow = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
    const wd = weekdayToken(hdr);

    // Block Sundays (header SUN or calendar Sunday) — never import.
    if (wd === 'SUN' || utcDow === 0) {
      dayCols.push({ col: c, day, dateKey, weekday: wd, blockedSunday: true });
      continue;
    }

    // Soft check: weekday header should match the calendar day for UI month/year.
    if (wd && WEEKDAY_UTC[wd] !== utcDow) {
      errors.push({
        sheet: sheetName,
        day,
        error: `Weekday header ${wd} does not match ${dateKey} (check selected month/year)`
      });
      continue;
    }

    dayCols.push({ col: c, day, dateKey, weekday: wd, blockedSunday: false });
  }

  if (!dayCols.some((d) => !d.blockedSunday)) {
    errors.push({
      sheet: sheetName,
      error: onlyDay != null
        ? `No importable column found for day ${onlyDay} in ${year}-${String(month).padStart(2, '0')} (Sundays are blocked)`
        : 'No day-number columns found on row 3 under weekday headers (Sundays are blocked)'
    });
    return {
      marks,
      skippedEmpty,
      skippedSunday,
      errors,
      meta: { month, year, source: resolved.source }
    };
  }

  for (let r = 3; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const empId = normUpper(cellStr(row, empCol));
    if (!empId) continue;

    const name = nameCol >= 0 ? cellStr(row, nameCol) : '';
    const phone = phoneCol >= 0 ? cellStr(row, phoneCol) : '';

    for (const { col, day, dateKey, blockedSunday } of dayCols) {
      const rawCell = cellStr(row, col);
      if (isEmptyMark(rawCell)) {
        skippedEmpty += 1;
        continue; // leave attendance unchanged for this date
      }
      if (blockedSunday) {
        skippedSunday += 1;
        continue;
      }

      const raw = normUpper(rawCell);
      const status = STATUS_MAP[raw];
      if (!status) {
        errors.push({
          sheet: sheetName,
          row: r + 1,
          empId,
          day,
          error: `Unknown mark "${raw}" (use P, A, or L; leave blank for no update)`
        });
        continue;
      }
      marks.push({
        sheet: sheetName,
        row: r + 1,
        empId,
        name,
        phone,
        phoneDigits: digitsOnly(phone),
        dateKey,
        date: new Date(`${dateKey}T00:00:00.000Z`),
        status
      });
    }
  }

  return {
    marks,
    skippedEmpty,
    skippedSunday,
    errors,
    meta: {
      month,
      year,
      sheet: sheetName,
      dayColumns: dayCols.filter((d) => !d.blockedSunday).length,
      sundayColumnsBlocked: dayCols.filter((d) => d.blockedSunday).length,
      source: resolved.source,
      onlyDay: onlyDay || null
    }
  };
};

/**
 * Read a workbook and extract Mirus attendance marks.
 * @param {Buffer} buffer
 * @param {{ month?: number, year?: number, onlyDay?: number }} [options]
 */
export const parseMirusAttendanceWorkbook = (buffer, options = {}) => {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const allMarks = [];
  const allErrors = [];
  let skippedEmpty = 0;
  let skippedSunday = 0;
  const sheets = [];

  for (const sheetName of wb.SheetNames) {
    const sh = wb.Sheets[sheetName];
    if (!sh) continue;
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    if (!isMirusAttendanceSheet(rows, { minDays: 1 })) continue;
    const parsed = parseMirusAttendanceSheet(rows, sheetName, options);
    sheets.push(parsed.meta);
    allMarks.push(...parsed.marks);
    allErrors.push(...parsed.errors);
    skippedEmpty += parsed.skippedEmpty;
    skippedSunday += parsed.skippedSunday || 0;
  }

  if (!sheets.length) {
    return { format: null, marks: [], skippedEmpty: 0, skippedSunday: 0, errors: [], sheets: [] };
  }

  return {
    format: 'mirus',
    marks: allMarks,
    skippedEmpty,
    skippedSunday,
    errors: allErrors,
    sheets
  };
};

/**
 * Single-day flat roster: Emp.Id | Name? | Status (P/A/L or Present/…).
 * Date comes entirely from the UI-selected dateKey (YYYY-MM-DD).
 */
export const parseSingleDayAttendanceWorkbook = (buffer, dateKey) => {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const marks = [];
  const errors = [];
  let skippedEmpty = 0;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) {
    return {
      format: null,
      marks: [],
      skippedEmpty: 0,
      errors: [{ error: 'Valid date (YYYY-MM-DD) is required for single-day import' }],
      sheets: []
    };
  }

  for (const sheetName of wb.SheetNames) {
    const sh = wb.Sheets[sheetName];
    if (!sh) continue;
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    if (!rows.length) continue;

    // Prefer a header row that contains Emp.Id / employeeId
    let headerIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i += 1) {
      const joined = (rows[i] || []).map((c) => norm(c).toLowerCase()).join('|');
      if (/emp\.?\s*id|employee\s*id/.test(joined)) {
        headerIdx = i;
        break;
      }
    }
    const header = rows[headerIdx] || [];
    const empCol = findCol(header, [/^emp\.?\s*id$/, /employee\s*id/, /^emp\s*id/, /^employeeid$/]);
    const nameCol = findCol(header, [/name of the employee/, /^name$/, /employee\s*name/]);
    const phoneCol = findCol(header, [/contact/, /phone/, /mobile/]);
    const statusCol = findCol(header, [/^status$/, /^attendance$/, /^mark$/]);

    if (empCol < 0) {
      errors.push({ sheet: sheetName, error: 'Emp.Id / employeeId column not found' });
      continue;
    }
    if (statusCol < 0) {
      errors.push({ sheet: sheetName, error: 'Status column not found (use Status with P/A/L)' });
      continue;
    }

    for (let r = headerIdx + 1; r < rows.length; r += 1) {
      const row = rows[r] || [];
      const empId = normUpper(cellStr(row, empCol));
      if (!empId) continue;
      const raw = normUpper(cellStr(row, statusCol));
      if (!raw) {
        skippedEmpty += 1;
        continue;
      }
      const status = STATUS_MAP[raw]
        || (['PRESENT', 'ABSENT', 'LEAVE', 'HALF-DAY', 'HALFDAY', 'WEEKOFF', 'HOLIDAY'].includes(raw)
          ? ({ PRESENT: 'Present', ABSENT: 'Absent', LEAVE: 'Leave', 'HALF-DAY': 'Half-Day', HALFDAY: 'Half-Day', WEEKOFF: 'WeekOff', HOLIDAY: 'Holiday' })[raw]
          : null);
      if (!status) {
        errors.push({
          sheet: sheetName,
          row: r + 1,
          empId,
          error: `Unknown status "${raw}"`
        });
        continue;
      }
      marks.push({
        sheet: sheetName,
        row: r + 1,
        empId,
        name: nameCol >= 0 ? cellStr(row, nameCol) : '',
        phone: phoneCol >= 0 ? cellStr(row, phoneCol) : '',
        phoneDigits: digitsOnly(phoneCol >= 0 ? cellStr(row, phoneCol) : ''),
        dateKey,
        date: new Date(`${dateKey}T00:00:00.000Z`),
        status
      });
    }
  }

  if (!marks.length && !errors.length) {
    return { format: null, marks: [], skippedEmpty, errors, sheets: [] };
  }

  return {
    format: 'single-day',
    marks,
    skippedEmpty,
    errors,
    sheets: [{ dateKey }]
  };
};

/** Normalize phone for matching stored mobiles. */
export const normalizePhoneDigits = digitsOnly;
