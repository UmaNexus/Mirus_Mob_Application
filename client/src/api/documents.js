import api from '../lib/axios.js';

export const listMyDocuments = () => api.get('/documents').then((r) => r.data.data);
export const listUserDocuments = (userId) => api.get(`/documents/user/${userId}`).then((r) => r.data.data);
export const verifyDocument = (fileId, status) =>
  api.patch(`/documents/file/${fileId}/verify`, { status }).then((r) => r.data.document);
export const deleteDocument = (fileId) => api.delete(`/documents/file/${fileId}`).then((r) => r.data);
export const documentFileUrl = (fileId) => `/api/documents/file/${fileId}`;

export const uploadDocument = ({ file, documentType, documentName, documentNumber }) => {
  const fd = new FormData();
  fd.append('document', file);
  fd.append('documentType', documentType);
  fd.append('documentName', documentName || '');
  fd.append('documentNumber', documentNumber);
  return api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};
