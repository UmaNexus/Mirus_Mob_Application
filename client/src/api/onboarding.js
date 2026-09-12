import api from '../lib/axios.js';

export const getOnboardingStatus = () => api.get('/onboarding/status').then((r) => r.data);
export const savePersonal = (body) => api.patch('/onboarding/personal', body).then((r) => r.data);
export const saveFamily = (familyDetails) => api.patch('/onboarding/family', { familyDetails }).then((r) => r.data);
export const saveContact = (body) => api.patch('/onboarding/contact', body).then((r) => r.data);
export const saveExperience = (body) => api.patch('/onboarding/experience', body).then((r) => r.data);
export const saveBank = (body) => api.patch('/onboarding/bank', body).then((r) => r.data);
