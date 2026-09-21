import api from './client';

export const listMine = () => api.get('/secondary-sales').then((res) => res.data.data);

export const listAlerts = () => api.get('/secondary-sales/alerts').then((res) => res.data.data);

export const create = (payload) => api.post('/secondary-sales', payload).then((res) => res.data.sale);

export const update = (id, payload) => api.patch(`/secondary-sales/${id}`, payload).then((res) => res.data.sale);

/** Every secondary-sale batch in the caller's scope (subtree, or company-wide for admin/superadmin) — for the Reports tab. */
export const listTeam = () => api.get('/secondary-sales/team').then((res) => res.data.data);
