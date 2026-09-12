import api from '../lib/axios.js';

// Document types (Epic 17)
export const listTypes = (params) => api.get('/uploaded-docs/types', { params }).then((r) => r.data.data);
export const createType = (body) => api.post('/uploaded-docs/types', body).then((r) => r.data.type);
export const updateType = (id, body) => api.put(`/uploaded-docs/types/${id}`, body).then((r) => r.data.type);
export const deleteType = (id) => api.delete(`/uploaded-docs/types/${id}`).then((r) => r.data);

// Per-employee records
export const uploadForEmployee = ({ userId, description, documentTypeId, file }) => {
  const fd = new FormData();
  fd.append('document', file);
  fd.append('userId', userId);
  fd.append('description', description);
  if (documentTypeId) fd.append('documentTypeId', documentTypeId);
  return api.post('/uploaded-docs', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.record);
};
export const myRecords = () => api.get('/uploaded-docs/mine').then((r) => r.data.data);
export const userRecords = (userId) => api.get(`/uploaded-docs/user/${userId}`).then((r) => r.data.data);
export const acceptRecord = (id) => api.post(`/uploaded-docs/${id}/accept`, { agree: true }).then((r) => r.data.record);
export const fillRecord = (id, fieldValues) => api.post(`/uploaded-docs/${id}/fill`, { fieldValues }).then((r) => r.data.record);
export const recordPdfUrl = (id) => `/api/uploaded-docs/${id}/pdf`;
