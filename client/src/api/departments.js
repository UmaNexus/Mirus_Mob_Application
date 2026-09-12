import api from '../lib/axios.js';

export const listDepartments = (params) =>
  api.get('/departments', { params }).then((r) => r.data.data);

export const createDepartment = (body) =>
  api.post('/departments', body).then((r) => r.data.department);

export const updateDepartment = (id, body) =>
  api.put(`/departments/${id}`, body).then((r) => r.data.department);

export const deleteDepartment = (id) =>
  api.delete(`/departments/${id}`).then((r) => r.data);
