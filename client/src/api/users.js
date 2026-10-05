import api from '../lib/axios.js';

export const listUsers = (params) => api.get('/users', { params }).then((r) => r.data);
// The ONLY valid reporting-manager candidates for a user (computed server-side from the hierarchy).
// `jobRoleId` previews the candidates for a role being chosen in the same dialog.
export const getEligibleManagers = (id, jobRoleId) =>
  api.get(`/users/${id}/eligible-managers`, { params: jobRoleId !== undefined ? { jobRoleId } : {} }).then((r) => r.data); // { data: candidates, inactiveEligible: names of otherwise-eligible INACTIVE users (only when none are active) }
// Same as updateUser but also returns response metadata (e.g. hierarchyWarning).
export const updateUserFull = (id, body) => api.put(`/users/${id}`, body).then((r) => r.data);
export const getUser = (id) => api.get(`/users/${id}`).then((r) => r.data.user);
export const getEmployeeOverview = (id) => api.get(`/users/${id}/overview`).then((r) => r.data);
export const updateUser = (id, body) => api.put(`/users/${id}`, body).then((r) => r.data.user);
export const deleteUser = (id) => api.delete(`/users/${id}`).then((r) => r.data);
export const permanentDeleteUser = (id) => api.delete(`/users/${id}/permanent`).then((r) => r.data);
export const restoreUser = (id) => api.post(`/users/${id}/restore`).then((r) => r.data);
export const generateCredentials = (id) => api.post(`/users/${id}/credentials`).then((r) => r.data);
export const sendPasswordResetLink = (id) => api.post(`/users/${id}/reset-link`).then((r) => r.data);
