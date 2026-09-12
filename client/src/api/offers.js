import api from '../lib/axios.js';

export const listOffers = (params) => api.get('/offers', { params }).then((r) => r.data);
export const getOffer = (id) => api.get(`/offers/${id}`).then((r) => r.data.offer);
export const createOffer = (body) => api.post('/offers', body).then((r) => r.data);
export const sendOfferEmail = (id, body) => api.post(`/offers/${id}/send`, body).then((r) => r.data);
export const updateOfferStatus = (id, status) => api.patch(`/offers/${id}/status`, { status }).then((r) => r.data.offer);
export const approveOffer = (id) => api.post(`/offers/${id}/approve`).then((r) => r.data);
export const generateAppointmentLetter = (id, body = {}) =>
  api.post(`/offers/${id}/appointment-letter`, body).then((r) => r.data);
export const resendOffer = (id) => api.post(`/offers/${id}/resend`).then((r) => r.data);
export const regenerateOffer = (id) => api.post(`/offers/${id}/regenerate`).then((r) => r.data);
export const deleteOffer = (id) => api.delete(`/offers/${id}`).then((r) => r.data);
export const offerPdfUrl = (id) => `/api/offers/${id}/pdf`;

// Employee self-service
export const getMyOffer = () => api.get('/offers/mine').then((r) => r.data);
export const myOfferPdfUrl = () => '/api/offers/mine/pdf';

export const bulkUploadOffers = (file) => {
  const fd = new FormData();
  fd.append('roster', file);
  return api.post('/offers/bulk', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};
