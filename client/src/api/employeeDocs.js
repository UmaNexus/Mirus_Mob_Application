import api from '../lib/axios.js';

// Generated + sealed statutory documents (Epic 10)
export const issueDocument = (body) => api.post('/employee-docs', body).then((r) => r.data.document);
export const myDocuments = () => api.get('/employee-docs/mine').then((r) => r.data.data);
export const userDocuments = (userId) => api.get(`/employee-docs/user/${userId}`).then((r) => r.data.data);
export const acknowledgeDocument = (id, body) => api.post(`/employee-docs/${id}/acknowledge`, body).then((r) => r.data.document);
export const employeeDocPdfUrl = (id) => `/api/employee-docs/${id}/pdf`;
