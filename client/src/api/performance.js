import api from '../lib/axios.js';

// Builds multipart form data from a plain body object plus an optional attachment file.
const toFormData = (body, file) => {
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
  if (file) fd.append('document', file);
  return fd;
};

// Reviews
export const createReview = (body) => api.post('/performance/reviews', body).then((r) => r.data.review);
export const updateReview = (id, body) => api.put(`/performance/reviews/${id}`, body).then((r) => r.data.review);
export const listReviews = (params) => api.get('/performance/reviews', { params }).then((r) => r.data);
export const myReviews = () => api.get('/performance/reviews/mine').then((r) => r.data.data);
export const deleteReview = (id) => api.delete(`/performance/reviews/${id}`).then((r) => r.data);

// Incentives
export const createIncentive = (body, file) => api.post('/performance/incentives', toFormData(body, file)).then((r) => r.data.incentive);
export const listIncentives = (params) => api.get('/performance/incentives', { params }).then((r) => r.data);
export const myIncentives = () => api.get('/performance/incentives/mine').then((r) => r.data.data);
export const incentiveAttachmentUrl = (id) => `/api/performance/incentives/${id}/attachment`;
export const deleteIncentive = (id) => api.delete(`/performance/incentives/${id}`).then((r) => r.data);

// Appraisals / promotions
export const createAppraisal = (body, file) => api.post('/performance/appraisals', toFormData(body, file)).then((r) => r.data.appraisal);
export const listAppraisals = (params) => api.get('/performance/appraisals', { params }).then((r) => r.data);
export const myAppraisals = () => api.get('/performance/appraisals/mine').then((r) => r.data.data);
export const appraisalAttachmentUrl = (id) => `/api/performance/appraisals/${id}/attachment`;
export const deleteAppraisal = (id) => api.delete(`/performance/appraisals/${id}`).then((r) => r.data);
// Training records (manual log)
export const createTrainingRecord = (body) => api.post('/performance/training-records', body).then((r) => r.data.record);
export const listTrainingRecords = (params) => api.get('/performance/training-records', { params }).then((r) => r.data.data);
export const myTrainingRecords = () => api.get('/performance/training-records/mine').then((r) => r.data.data);
export const deleteTrainingRecord = (id) => api.delete(`/performance/training-records/${id}`).then((r) => r.data);
