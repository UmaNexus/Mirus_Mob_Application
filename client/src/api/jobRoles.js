import api from '../lib/axios.js';

export const listJobRoles = (params) =>
  api.get('/job-roles', { params }).then((r) => r.data.data);

export const createJobRole = (body) =>
  api.post('/job-roles', body).then((r) => r.data.role);

export const updateJobRole = (id, body) =>
  api.put(`/job-roles/${id}`, body).then((r) => r.data.role);

export const deleteJobRole = (id) =>
  api.delete(`/job-roles/${id}`).then((r) => r.data);
