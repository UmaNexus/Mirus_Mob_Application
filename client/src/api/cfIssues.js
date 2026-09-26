import api from '../lib/axios.js';

export const getCFIssueFields = (type) =>
  api.get('/cf-issues/fields', { params: { type } }).then((r) => r.data);

export const listCFIssues = () => api.get('/cf-issues').then((r) => r.data);
export const createAndSendCFIssue = (body) => api.post('/cf-issues', body).then((r) => r.data);
export const cfIssuePdfUrl = (id) => `/api/cf-issues/${id}/pdf`;
export const downloadCFIssuePdfBlob = (id) =>
  api.get(`/cf-issues/${id}/pdf`, { responseType: 'blob' });
export const cfIssueDocxUrl = (id) => `/api/cf-issues/${id}/docx`;
export const downloadCFIssueDocxBlob = (id) =>
  api.get(`/cf-issues/${id}/docx`, { responseType: 'blob' });

