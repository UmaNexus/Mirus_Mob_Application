import axios from 'axios';

// Single API client. `withCredentials` ensures the HTTP-only auth cookie is
// sent on every request. baseURL '/api' is proxied to the Express server in
// dev (see vite.config.js) and same-origin in production.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true
});

// Normalize error messages so the UI can always read `err.uiMessage`.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const details = error.response?.data?.details;
    const detailMsg = Array.isArray(details) && details.length
      ? details.map((d) => d.message).filter(Boolean).join('; ')
      : '';
    let message =
      (error.response?.data?.message === 'Validation failed' && detailMsg)
        ? detailMsg
        : (error.response?.data?.message || detailMsg || error.message || 'Something went wrong');
    if (status === 413) {
      message = 'File is too large for the server. Check the allowed size and try again.';
    }
    error.uiMessage = message;
    return Promise.reject(error);
  }
);

export default api;
