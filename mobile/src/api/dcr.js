import api from './client';

export const listMine = (params) => api.get('/dcr', { params }).then((res) => res.data.data);

/** Creates a call as `status: pending` (individual/joint) — the same endpoint Today's Work Type's "Confirm & Log Call" uses. */
export const create = (payload) => api.post('/dcr', payload).then((res) => res.data.dcr);

/** Completes/edits one of the caller's own calls — samples, product detail, feedback, visit time, and the pending → completed/missed transition. */
export const update = (id, payload) => api.patch(`/dcr/${id}`, payload).then((res) => res.data.dcr);

export const submitDay = (date) => api.patch('/dcr/submit-day', { date }).then((res) => res.data);

/** Bulk-transitions the caller's own still-pending calls for a day to `missed`, offered alongside Submit DCR at end of day. */
export const markRemainingMissed = (date) => api.patch('/dcr/mark-remaining-missed', { date }).then((res) => res.data);

/** The caller's own reporting-manager chain — for the joint-call "accompanied by" picker. */
export const myChain = () => api.get('/field-force/my-chain').then((res) => res.data.data);
