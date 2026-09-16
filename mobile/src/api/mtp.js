import api from './client';

/** A BDM may hold several independent tour plans within one month — this always returns every one of them. */
export const listMine = (month) => api.get('/mtp', { params: month ? { month } : undefined }).then((res) => res.data.data);

/** Always starts a brand-new tour ("+ Create New Tour") — existing tours for the same month are never touched. */
export const create = (payload) => api.post('/mtp', payload).then((res) => res.data.mtp);

/** Edits one specific still-editable (draft/rejected/withdrawn) tour by id. */
export const update = (id, payload) => api.patch(`/mtp/${id}`, payload).then((res) => res.data.mtp);

/** The caller's own eligible approvers (real reporting-chain managers, ASM+) — the only valid source for "Select Approver". */
export const listApprovers = () => api.get('/mtp/approvers').then((res) => res.data.data);

export const submit = (id, approverId, remarks) => api.patch(`/mtp/${id}/submit`, { approverId, remarks }).then((res) => res.data.mtp);

export const withdraw = (id) => api.patch(`/mtp/${id}/withdraw`).then((res) => res.data.mtp);

// ---- Manager (ASM+) review — scoped server-side to the caller's reporting subtree ----

export const listTeam = (month) => api.get('/mtp/team', { params: month ? { month } : undefined }).then((res) => res.data.data);

export const listPending = () => api.get('/mtp/pending').then((res) => res.data.data);

export const decide = (id, status, note) => api.patch(`/mtp/${id}/decision`, { status, note }).then((res) => res.data.mtp);
