import api from '../lib/axios.js';

export const generatePayslips = (body) => api.post('/payslips/generate', body).then((r) => r.data);
export const listPayslips = (params) => api.get('/payslips', { params }).then((r) => r.data);
export const listMyPayslips = (params) => api.get('/payslips/mine', { params }).then((r) => r.data.data);
export const payslipPdfUrl = (id) => `/api/payslips/${id}/pdf`;
