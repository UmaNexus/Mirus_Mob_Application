import api from './client';

export const listMine = () => api.get('/stockists').then((res) => res.data.data);

export const create = (payload) => api.post('/stockists', payload).then((res) => res.data.stockist);

export const update = (id, payload) => api.patch(`/stockists/${id}`, payload).then((res) => res.data.stockist);

/** Every stockist in the caller's scope (subtree, or company-wide for admin/superadmin) — for the Reports tab. */
export const listTeam = () => api.get('/stockists/team').then((res) => res.data.data);
