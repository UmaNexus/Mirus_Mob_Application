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

