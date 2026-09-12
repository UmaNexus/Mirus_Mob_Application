/**
 * Public SPA origin used in emails (offer magic links, password setup, login).
 *
 * Prefer CLIENT_ORIGIN (or PUBLIC_APP_URL). Never default to Vite :5173 in
 * production/Docker — that port is not exposed. Dev still falls back to 5173.
 */
export const clientOrigin = () => {
  const raw = (process.env.CLIENT_ORIGIN || process.env.PUBLIC_APP_URL || '').trim();
  if (raw) return raw.replace(/\/$/, '');

  if (process.env.NODE_ENV === 'production') {
    // Same host as the nginx SPA (docker-compose maps client:80). Absolute
    // URLs still need a host — operators should set CLIENT_ORIGIN.
    console.warn('[config] CLIENT_ORIGIN is unset in production; magic links may be wrong. Set CLIENT_ORIGIN to your public URL (e.g. http://hrms-mirus.com).');
    return 'http://localhost';
  }

  return 'http://localhost:5173';
};

/** Origins allowed by CORS (comma-separated CLIENT_ORIGINS, or CLIENT_ORIGIN). */
export const corsOrigins = () => {
  const multi = (process.env.CLIENT_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (multi.length) return multi;
  return [clientOrigin()];
};
