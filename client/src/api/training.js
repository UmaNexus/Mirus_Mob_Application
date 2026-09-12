import api from '../lib/axios.js';

export const listSections = () => api.get('/training/sections').then((r) => r.data.data);
export const createSection = (body) => api.post('/training/sections', body).then((r) => r.data.section);
export const deleteSection = (id) => api.delete(`/training/sections/${id}`).then((r) => r.data);
export const listMedia = (params) => api.get('/training/media', { params }).then((r) => r.data.data);
export const uploadMedia = ({ sectionId, title, description, file }) => {
  const fd = new FormData();
  fd.append('video', file);
  fd.append('sectionId', sectionId);
  fd.append('title', title);
  if (description) fd.append('description', description);
  // Do not set Content-Type manually — the browser must add the multipart boundary.
  return api.post('/training/media', fd, { timeout: 10 * 60 * 1000 }).then((r) => r.data.media);
};
export const deleteMedia = (id) => api.delete(`/training/media/${id}`).then((r) => r.data);
export const mediaStreamUrl = (id) => `/api/training/media/${id}/stream`;
export const setProgress = (id, status) => api.post(`/training/media/${id}/progress`, { status }).then((r) => r.data.progress);
export const myProgress = () => api.get('/training/progress/mine').then((r) => r.data.data);
