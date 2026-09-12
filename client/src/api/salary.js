import api from '../lib/axios.js';

// Templates
export const listTemplates = (params) => api.get('/salary-templates', { params }).then((r) => r.data.data);
export const getTemplate = (id) => api.get(`/salary-templates/${id}`).then((r) => r.data.template);
export const createTemplate = (body) => api.post('/salary-templates', body).then((r) => r.data.template);
export const updateTemplate = (id, body) => api.put(`/salary-templates/${id}`, body).then((r) => r.data.template);
export const deactivateTemplate = (id) => api.delete(`/salary-templates/${id}`).then((r) => r.data);
/** Hard-delete an inactive salary structure template. */
export const deleteInactiveTemplate = (id) => api.delete(`/salary-templates/${id}/permanent`).then((r) => r.data);

// Assignments
export const assignSalary = (body) => api.post('/salary-assignments', body).then((r) => r.data.assignment);
export const getAssignment = (userId) => api.get(`/salary-assignments/user/${userId}`).then((r) => r.data.assignment);
