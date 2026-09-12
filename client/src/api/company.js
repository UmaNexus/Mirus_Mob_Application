import api from '../lib/axios.js';

export const getCompany = () => api.get('/company').then((r) => r.data.company);
export const updateCompany = (body) => api.put('/company', body).then((r) => r.data.company);
export const uploadCompanyAsset = (kind, file) => {
  const fd = new FormData();
  fd.append('asset', file);
  return api.post(`/company/asset/${kind}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

/** Authorized preview URL for a branding asset (logo | letterhead | letterOutline | stamp | signature). */
export const companyAssetUrl = (kind) => `/api/company/asset/${kind}`;
