import api from './client';

export const listMine = () => api.get('/stockists').then((res) => res.data.data);

export const create = (payload) => api.post('/stockists', payload).then((res) => res.data.stockist);

export const update = (id, payload) => api.patch(`/stockists/${id}`, payload).then((res) => res.data.stockist);
