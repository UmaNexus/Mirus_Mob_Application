import api from './client';

/**
 * POST /api/auth/login — matches the existing HRMS login contract exactly
 * (company code + email-or-employee-ID + password). The role and
 * fieldForce.tier the app needs for navigation come back on `user`, never
 * chosen by the client.
 */
export const login = ({ companySlug, identifier, password }) =>
  api.post('/auth/login', { companySlug, identifier, password }).then((res) => res.data);

export const logout = () => api.post('/auth/logout').then((res) => res.data);

export const getCurrentUser = () => api.get('/auth/me').then((res) => res.data);
