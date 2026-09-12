import { getStore, runWithStore } from '../utils/tenantContext.js';

/**
 * Run an email send off the HTTP critical path while preserving tenant ALS.
 * In tests, runs inline so assertions stay deterministic.
 *
 * @param {() => Promise<unknown>} jobFn
 * @returns {Promise<{ queued: boolean, mode: string, result?: unknown }>}
 */
export const queueMailJob = (jobFn) => {
  const store = getStore();
  const snapshot = {
    companyId: store?.companyId ?? null,
    role: store?.role ?? null,
    authed: store?.authed ?? false
  };

  const run = () => runWithStore({ ...snapshot }, async () => {
    try {
      return await jobFn();
    } catch (err) {
      console.error('[email queue]', err?.message || err);
      return { delivered: false, mode: 'error', error: err?.message || String(err) };
    }
  });

  if (process.env.NODE_ENV === 'test') {
    return Promise.resolve(run()).then((result) => ({ queued: false, mode: 'inline', result }));
  }

  setImmediate(() => {
    Promise.resolve(run()).catch((err) => {
      console.error('[email queue fatal]', err?.message || err);
    });
  });

  return Promise.resolve({ queued: true, mode: 'async' });
};
