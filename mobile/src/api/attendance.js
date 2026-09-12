import api from './client';

export const getToday = () => api.get('/attendance/today').then((res) => res.data.record);
export const punchIn = () => api.post('/attendance/punch-in').then((res) => res.data.record);
export const punchOut = () => api.post('/attendance/punch-out').then((res) => res.data.record);
