import api from './client';

export const registerDevice = ({ token, platform, deviceId }) =>
  api.post('/notifications/devices/register', { token, platform, deviceId }).then((res) => res.data);

export const unregisterDevice = (token) =>
  api.post('/notifications/devices/unregister', { token }).then((res) => res.data);

export const listNotifications = (params = {}) =>
  api.get('/notifications', { params }).then((res) => res.data);

export const getUnreadCount = () =>
  api.get('/notifications/unread-count').then((res) => res.data.unreadCount);

export const markAsRead = (id) =>
  api.patch(`/notifications/${id}/read`).then((res) => res.data.notification);

export const markAllAsRead = () =>
  api.patch('/notifications/mark-all-read').then((res) => res.data);

export default {
  registerDevice,
  unregisterDevice,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
