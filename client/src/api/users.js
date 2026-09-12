import api from '../lib/axios.js';

export const listUsers = (params) => api.get('/users', { params }).then((r) => r.data);
export const getUser = (id) => api.get(`/users/${id}`).then((r) => r.data.user);
export const getEmployeeOverview = (id) => api.get(`/users/${id}/overview`).then((r) => r.data);
export const updateUser = (id, body) => api.put(`/users/${id}`, body).then((r) => r.data.user);
export const deleteUser = (id) => api.delete(`/users/${id}`).then((r) => r.data);
export const permanentDeleteUser = (id) => api.delete(`/users/${id}/permanent`).then((r) => r.data);
export const restoreUser = (id) => api.post(`/users/${id}/restore`).then((r) => r.data);
export const generateCredentials = (id) => api.post(`/users/${id}/credentials`).then((r) => r.data);
export const sendPasswordResetLink = (id) => api.post(`/users/${id}/reset-link`).then((r) => r.data);
