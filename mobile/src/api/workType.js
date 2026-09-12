import api from './client';

export const upsert = (payload) => api.post('/work-type', payload).then((res) => res.data.workType);

export const listMine = (params) => api.get('/work-type', { params }).then((res) => res.data.data);
