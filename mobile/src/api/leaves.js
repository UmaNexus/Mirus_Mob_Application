import api from './client';

export const apply = (data) => api.post('/leaves', data).then((res) => res.data.leave);
export const listMine = () => api.get('/leaves/mine').then((res) => res.data.data);
export const cancel = (id) => api.patch(`/leaves/${id}/cancel`).then((res) => res.data.leave);
