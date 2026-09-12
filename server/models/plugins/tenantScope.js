import mongoose from 'mongoose';
import { getStore } from '../../utils/tenantContext.js';

/**
 * tenantScope (Epic T) — the single, tested place where multi-tenant data
 * isolation is enforced. Applied to every tenant-scoped schema so the safe path
 * (scoped-by-companyId) is the default and only path; controllers never write
 * manual `companyId` filters.
 *
 * Behavior:
 *  - Queries (find/update/delete/count/…): inject `companyId = ctx.companyId`
 *    into the filter, unless the filter already pins a companyId or the caller
 *    is a superadmin that opted out via `.skipTenant()`.
 *  - Aggregations: unshift a `$match: { companyId }` stage.
 *  - save/insertMany: default `companyId` from context if unset; block writes
 *    whose `companyId` disagrees with the active tenant.
 *  - No active store (seed scripts / migrations / tests) => not scoped. Those
 *    are trusted server-side contexts; the HTTP layer always sets a store.
 */

const QUERY_OPS = [
  'count', 'countDocuments', 'find', 'findOne', 'findOneAndUpdate',
  'findOneAndDelete', 'findOneAndReplace', 'updateOne', 'updateMany',
  'deleteOne', 'deleteMany', 'replaceOne', 'distinct'
];

const bypasses = (store, query) => {
  // Explicit opt-out, honored only for superadmins.
  if (query.getOptions?.().skipTenant) {
    if (store.role !== 'superadmin') {
      throw Object.assign(new Error('Cross-tenant query not permitted'), { statusCode: 403 });
    }
    return true;
  }
  return false;
};

export default function tenantScope(schema) {
  // --- Read/write queries ---
  QUERY_OPS.forEach((op) => {
    schema.pre(op, function applyTenantFilter() {
      const store = getStore();
      if (!store || !store.companyId) return; // trusted / pre-auth context
      if (bypasses(store, this)) return;
      const filter = this.getFilter();
      if (filter.companyId == null) this.where({ companyId: store.companyId });
    });
  });

  // --- Aggregations ---
  schema.pre('aggregate', function applyTenantMatch() {
    const store = getStore();
    if (!store || !store.companyId) return;
    if (this.options?.skipTenant) {
      if (store.role !== 'superadmin') {
        throw Object.assign(new Error('Cross-tenant aggregation not permitted'), { statusCode: 403 });
      }
      return;
    }
    // Aggregation does NOT auto-cast strings to ObjectId — do it explicitly.
    this.pipeline().unshift({ $match: { companyId: new mongoose.Types.ObjectId(store.companyId) } });
  });

  // --- Document saves ---
  // Stamp in pre('validate') — it runs BEFORE validation, so the required
  // `companyId` is present by the time the schema validators check it. A
  // pre('save') hook would run too late (Mongoose validates before save).
  schema.pre('validate', function stampTenant(next) {
    const store = getStore();
    if (store && store.companyId) {
      if (this.companyId == null) this.companyId = store.companyId;
      else if (store.role !== 'superadmin' && String(this.companyId) !== String(store.companyId)) {
        return next(Object.assign(new Error('Cross-tenant write blocked'), { statusCode: 403 }));
      }
    }
    next();
  });

  // --- Bulk inserts ---
  schema.pre('insertMany', function stampMany(next, docs) {
    const store = getStore();
    if (store && store.companyId && Array.isArray(docs)) {
      for (const doc of docs) {
        if (doc.companyId == null) doc.companyId = store.companyId;
        else if (store.role !== 'superadmin' && String(doc.companyId) !== String(store.companyId)) {
          return next(Object.assign(new Error('Cross-tenant bulk write blocked'), { statusCode: 403 }));
        }
      }
    }
    next();
  });

  // Query helper: Model.find(...).skipTenant()  (superadmin only; see bypasses()).
  schema.query.skipTenant = function skipTenant() { return this.setOptions({ skipTenant: true }); };
}
