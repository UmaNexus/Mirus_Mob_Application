import api from './client';

export const listMine = () => api.get('/secondary-sales').then((res) => res.data.data);

export const listAlerts = () => api.get('/secondary-sales/alerts').then((res) => res.data.data);

export const create = (payload) => api.post('/secondary-sales', payload).then((res) => res.data.sale);

export const update = (id, payload) => api.patch(`/secondary-sales/${id}`, payload).then((res) => res.data.sale);
