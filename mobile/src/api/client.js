import axios from 'axios';
import Constants from 'expo-constants';
import { getToken, clearToken } from './tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:5000/api';

/**
 * Central API client. Every request:
 *  - identifies itself as the mobile client (`X-Client: mobile`) so the
 *    backend's login endpoint knows to return a raw token in the body
 *    (see server/controllers/authController.js) instead of only a cookie.
 *  - attaches the stored Bearer token, when present, for every other call.
 * `withCredentials` is NOT set — a mobile client has no browser cookie jar,
 * and the Bearer token is the sole auth mechanism here.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-Client': 'mobile',
    'ngrok-skip-browser-warning': 'true'
  },
  timeout: 15000
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Normalize backend errors into a single `uiMessage` string (mirrors the
 * existing web client's axios interceptor convention in
 * client/src/lib/axios.js) and clear a stale token on 401 so the app falls
 * back to the login screen instead of looping on authenticated requests.
 */
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    const data = err.response?.data;

    if (status === 401) {
      await clearToken();
      if (onUnauthorized) onUnauthorized();
    }

    let uiMessage = 'Something went wrong. Please try again.';
    if (!err.response) {
      uiMessage = 'Network error — check your connection and try again.';
    } else if (Array.isArray(data?.details) && data.details.length) {
      uiMessage = data.details.map((d) => d.message).join('\n');
    } else if (data?.message) {
      uiMessage = data.message;
    }

    err.uiMessage = uiMessage;
    return Promise.reject(err);
  }
);

export default api;
