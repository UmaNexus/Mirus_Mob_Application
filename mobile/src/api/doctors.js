import api from './client';

/** A BDM's own assigned doctors — view-only, per the backend's ownership scope. */
export const listMine = () => api.get('/doctors/mine').then((res) => res.data.data);

export const listAlerts = () => api.get('/doctors/alerts').then((res) => res.data.data);
