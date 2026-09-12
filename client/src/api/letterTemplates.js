import api from '../lib/axios.js';

export const LETTER_TYPES = ['OfferLetter', 'AppointmentLetter', 'ServiceLetter', 'FNFLetter'];

export const LETTER_TYPE_LABELS = {
  OfferLetter: 'Offer Letter',
  AppointmentLetter: 'Appointment Letter',
  ServiceLetter: 'Service Letter',
  FNFLetter: 'Full & Final (FNF) Letter'
};

export const listLetterTemplates = (params) => api.get('/letter-templates', { params }).then((r) => r.data);
export const createLetterTemplate = (formData) =>
  api.post('/letter-templates', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.template);
export const updateLetterTemplate = (id, formData) =>
  api.put(`/letter-templates/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.template);
export const deleteLetterTemplate = (id) => api.delete(`/letter-templates/${id}`).then((r) => r.data);

/** Authorized inline view URL for an uploaded letter template PDF. */
export const letterTemplateFileUrl = (id) => `/api/letter-templates/${id}/file`;
