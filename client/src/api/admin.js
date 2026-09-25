import api from '../lib/axios.js';

// Org Hierarchy — organization hierarchy, role/manager assignment,
// permissions catalog. Every call hits the server's existing tenant-scoped,
// USER_ROLE_CHANGE-gated /api/admin routes (admin/superadmin only).
export const getHierarchy = () => api.get('/admin/hierarchy').then((r) => r.data.data);
export const getPermissionsCatalog = () => api.get('/admin/permissions').then((r) => r.data.data);
export const replaceManager = (oldManagerId, newManagerId) =>
  api.post('/admin/hierarchy/replace-manager', { oldManagerId, newManagerId }).then((r) => r.data.data);
