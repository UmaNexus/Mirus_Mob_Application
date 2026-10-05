import api from './client';

export const getDashboard = () => api.get('/field-force/dashboard').then((res) => res.data.data);

export const getAlerts = () => api.get('/field-force/alerts').then((res) => res.data.data);

export const getCalendar = (month) => api.get('/field-force/calendar', { params: { month } }).then((res) => res.data.data);

/** The caller's reporting subtree roster (a manager's own BDMs/managers) — used to populate "assign to" pickers. */
export const getTeam = () => api.get('/field-force/team').then((res) => res.data.data);

/** The caller's own eligible Joint Call / Manager Meeting participants: { managers, others }. */
export const getJointCallParticipants = () => api.get('/field-force/joint-call-participants').then((res) => res.data.data);

/** Live field-force monitor KPIs for managers (team size, today's DCRs, pending MTPs, pending expenses). */
export const getMonitor = () => api.get('/field-force/monitor').then((res) => res.data.data);

/** Per-BDM DCR/MTP/visit performance within the caller's own reporting subtree, plus an on-target/needs-review summary. */
export const getTeamPerformance = (month) =>
  api.get('/field-force/team-performance', { params: { month } }).then((res) => res.data);

/**
 * The caller's own reporting subtree's attendance for today/this week/this
 * month, plus a fixed current-month summary. `jobRoleId` (optional) selects any
 * role in scope for the executive Attendance tab — omit it to get the leaf
 * field-rep behavior every manager screen relies on.
 */
export const getTeamAttendance = (period, jobRoleId) =>
  api.get('/field-force/team-attendance', { params: { period, jobRoleId } }).then((res) => res.data);

// ---- NSM/Admin executive monitoring — read-only, no approval/decision route ----

/** Home screen roll-up: role counts, attendance-today, DCR/MTP rates, pending counts, doctor coverage — scoped to the caller's own subtree, or company-wide for admin/superadmin. */
export const getOrgSummary = (month) => api.get('/field-force/org-summary', { params: { month } }).then((res) => res.data.data);

/**
 * Monitor tab drill-down: exactly one level of the hierarchy at a time.
 * Omit `managerId` for the top of the caller's own scope; pass it (always
 * re-validated server-side) to drill into that manager's direct reports.
 */
export const getTierDirectory = ({ managerId, month } = {}) =>
  api.get('/field-force/tier-directory', { params: { managerId, month } }).then((res) => res.data);

/** Reports tab period summary (today/week/month/quarter/ytd) plus the same numbers for the immediately preceding period. */
export const getReportsSummary = (period) => api.get('/field-force/reports-summary', { params: { period } }).then((res) => res.data);

