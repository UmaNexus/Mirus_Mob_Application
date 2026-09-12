import api from '../lib/axios.js';

export const CF_TEMPLATE_TYPES = ['CFAgent', 'CFDistributor', 'CFWholesaler'];

export const CF_TYPE_LABELS = {
  CFAgent: 'C&F Agent',
  CFDistributor: 'C&F Distributor',
  CFWholesaler: 'C&F Wholesaler'
};

export const listCFTemplates = (params) => api.get('/cf-templates', { params }).then((r) => r.data);
export const createCFTemplate = (formData) =>
  api.post('/cf-templates', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.template);
export const updateCFTemplate = (id, formData) =>
  api.put(`/cf-templates/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.template);
export const deleteCFTemplate = (id) => api.delete(`/cf-templates/${id}`).then((r) => r.data);

/** Authorized inline download URL for a stored C&F agreement file. */
export const cfTemplateFileUrl = (id) => `/api/cf-templates/${id}/file`;
