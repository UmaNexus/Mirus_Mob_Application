import api from './client';

export const listMine = (params) => api.get('/dcr', { params }).then((res) => res.data.data);

export const create = (payload) => api.post('/dcr', payload).then((res) => res.data.dcr);

export const submitDay = (date) => api.patch('/dcr/submit-day', { date }).then((res) => res.data);

/** The caller's own reporting-manager chain — for the joint-call "accompanied by" picker. */
export const myChain = () => api.get('/field-force/my-chain').then((res) => res.data.data);
