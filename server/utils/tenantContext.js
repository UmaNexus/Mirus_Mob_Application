import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped tenant context (Epic T).
 *
 * A single AsyncLocalStorage store carries `{ companyId, role, authed }` for the
 * lifetime of a request. `verifyToken` (and the candidate/tenant resolver) fill
 * it; the `tenantScope` Mongoose plugin reads it to auto-scope every query and
 * write. Nothing else needs `req` threaded through for tenancy.
 *
 * Outside an HTTP request (seed scripts, migrations, tests) there is no store —
 * those are trusted server-side contexts and are not auto-scoped. The security
 * boundary is the HTTP layer, where the context middleware always establishes a
 * store and `verifyToken` always fills `companyId` for authenticated routes.
 */
const als = new AsyncLocalStorage();

/** Run `fn` with a fresh (mutable) tenant store. Used by the Express middleware. */
export const runWithStore = (store, fn) => als.run(store, fn);

/** Current tenant store, or null when running outside a request. */
export const getStore = () => als.getStore() || null;

/** Convenience: the active companyId (or null). */
export const currentCompanyId = () => als.getStore()?.companyId || null;

/** Convenience: the active role (or null). */
export const currentRole = () => als.getStore()?.role || null;

/**
 * Set/replace the tenant identity on the active store. Called by verifyToken,
 * login, and the candidate resolver once the tenant is known.
 */
export const setTenant = ({ companyId, role, authed = true }) => {
  const store = als.getStore();
  if (!store) throw new Error('setTenant called outside a tenant context');
  store.companyId = companyId ? String(companyId) : null;
  store.role = role || null;
  store.authed = authed;
};

/**
 * Express middleware: establish an empty store for every request so downstream
 * handlers (and the models they touch) share one mutable context object.
 */
export const tenantContextMiddleware = (req, res, next) => {
  runWithStore({ companyId: null, role: null, authed: false }, () => next());
};
