import api from './client';

export const listMine = (month) => api.get('/mtp', { params: month ? { month } : undefined }).then((res) => res.data.data);

export const upsert = (payload) => api.post('/mtp', payload).then((res) => res.data.mtp);

export const submit = (id, remarks) => api.patch(`/mtp/${id}/submit`, { remarks }).then((res) => res.data.mtp);

export const withdraw = (id) => api.patch(`/mtp/${id}/withdraw`).then((res) => res.data.mtp);
