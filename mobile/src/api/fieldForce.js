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

/** The caller's own reporting subtree's BDM attendance for today/this week/this month, plus a fixed current-month summary. */
export const getTeamAttendance = (period) =>
  api.get('/field-force/team-attendance', { params: { period } }).then((res) => res.data);

