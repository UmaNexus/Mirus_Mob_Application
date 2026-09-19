import api from './client';

/**
 * A BDM's own assigned doctors — view-only, per the backend's ownership
 * scope. `area` filters to one territory; each doctor is enriched with real
 * `lastVisitAt` computed from the backend's own DCR data.
 */
export const listMine = ({ area } = {}) =>
  api.get('/doctors/mine', { params: { area: area || undefined } }).then((res) => res.data.data);

export const listAlerts = () => api.get('/doctors/alerts').then((res) => res.data.data);

// ---- Manager (ASM+) doctor assignment — scoped server-side to the caller's reporting subtree ----

export const listManaged = ({ assignedTo, unassigned, search } = {}) =>
  api.get('/doctors', { params: { assignedTo: assignedTo || undefined, unassigned: unassigned || undefined, search: search || undefined } })
    .then((res) => res.data.data);

export const create = (payload) => api.post('/doctors', payload).then((res) => res.data.doctor);

export const update = (id, payload) => api.patch(`/doctors/${id}`, payload).then((res) => res.data.doctor);

/**
 * `file` is a { uri, name, mimeType, file? } object as returned by
 * expo-document-picker. Preview only parses/validates — nothing is written.
 */
export const previewImport = (file) => {
  const form = new FormData();
  if (file.file) {
    form.append('roster', file.file, file.name || 'roster.xlsx');
  } else {
    form.append('roster', { uri: file.uri, name: file.name || 'roster.xlsx', type: file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  return api.post('/doctors/import/preview', form).then((res) => res.data);
};

/** `rows` is the (optionally user-trimmed) array of rows returned by previewImport. */
export const confirmImport = (rows) => api.post('/doctors/import/confirm', { rows }).then((res) => res.data);
