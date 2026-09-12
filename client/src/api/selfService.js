import api from '../lib/axios.js';

export const getHubOverview = () => api.get('/self-service/overview').then((r) => r.data);
