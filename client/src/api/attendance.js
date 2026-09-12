import api from '../lib/axios.js';

// Attendance
export const markMyAttendance = (body) => api.post('/attendance/mark', body).then((r) => r.data.record);
export const myAttendance = (params) => api.get('/attendance/mine', { params }).then((r) => r.data.data);
export const markAttendance = (body) => api.post('/attendance', body).then((r) => r.data.record);
export const markBulkAttendance = (body) => api.post('/attendance/bulk', body).then((r) => r.data);
/**
 * Bulk attendance upload.
 * @param {File} file
 * @param {{ mode: 'month'|'day', month?: number, year?: number, date?: string }} period
 */
export const bulkUploadAttendance = (file, period = {}) => {
  const fd = new FormData();
  fd.append('roster', file);
  fd.append('mode', period.mode || 'month');
  if (period.mode === 'day') {
    fd.append('date', period.date || '');
  } else {
    fd.append('month', String(period.month ?? ''));
    fd.append('year', String(period.year ?? ''));
  }
  return api.post('/attendance/bulk-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};
export const listAttendance = (params) => api.get('/attendance', { params }).then((r) => r.data.data);

// Leave
export const applyLeave = (body) => api.post('/leaves', body).then((r) => r.data.leave);
export const myLeaves = () => api.get('/leaves/mine').then((r) => r.data.data);
export const listLeaves = (params) => api.get('/leaves', { params }).then((r) => r.data.data);
export const decideLeave = (id, body) => api.patch(`/leaves/${id}/decision`, body).then((r) => r.data.leave);
export const cancelLeave = (id) => api.patch(`/leaves/${id}/cancel`).then((r) => r.data.leave);

// Holidays
export const listHolidays = (params) => api.get('/holidays', { params }).then((r) => r.data.data);
export const createHoliday = (body) => api.post('/holidays', body).then((r) => r.data.holiday);
export const deleteHoliday = (id) => api.delete(`/holidays/${id}`).then((r) => r.data);
