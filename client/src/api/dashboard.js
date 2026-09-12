import api from '../lib/axios.js';

export const getDashboardStats = () => api.get('/dashboard/stats').then((r) => r.data.stats);

export const getDashboardActivity = (limit = 8) =>
  api.get('/dashboard/activity', { params: { limit } }).then((r) => r.data.data);
