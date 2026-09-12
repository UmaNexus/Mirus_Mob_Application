import api from '../lib/axios.js';

export const listAssets = (params) => api.get('/assets', { params }).then((r) => r.data.data);
export const myAssets = () => api.get('/assets/mine').then((r) => r.data.data);
export const createAsset = (body) => api.post('/assets', body).then((r) => r.data.asset);
export const assignAsset = (id, userId) => api.post(`/assets/${id}/assign`, { userId }).then((r) => r.data.asset);
export const returnAsset = (id, condition) => api.post(`/assets/${id}/return`, { condition }).then((r) => r.data.asset);
export const updateAsset = (id, body) => api.patch(`/assets/${id}`, body).then((r) => r.data.asset);
export const deleteAsset = (id) => api.delete(`/assets/${id}`).then((r) => r.data);
