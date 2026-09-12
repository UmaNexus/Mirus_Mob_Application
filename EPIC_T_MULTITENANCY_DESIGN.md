# Epic T — Multi-Tenancy Foundation (Technical Design)

Status: **Design for review** (no code yet). Converts the single-tenant HRMS into a
**multi-tenant SaaS**: many companies share one deployment with fully isolated data.
This epic is a prerequisite for all other new epics (C, 8–17).

> Design rule: **data isolation is centralized and default-on**. No controller may
> query without a tenant scope; isolation lives in a Mongoose plugin, not in
> hand-written filters.

---

## 1. Goals & non-goals

**Goals**
- Every tenant-scoped record carries an indexed `companyId`.
- All reads/writes are auto-scoped to the caller's company — cross-tenant access is
  impossible by default.
- Auth understands companies: same email may exist in different companies.
- A platform **superadmin** manages tenants; each company has its own admins.
- Existing data migrates into a default "legacy" company with zero data loss.

**Non-goals (this epic)**
- Per-tenant subdomains/custom domains (use a header/company-code for now; subdomains later).
- Separate physical databases per tenant (we use **shared DB, shared collections, row-level `companyId`**).
- Billing/subscription management.

---

## 2. Tenancy model choice

**Shared database, shared schema, discriminator column (`companyId`).**
Rationale: simplest to operate for 10–100-employee tenants, single migration surface,
and Mongo indexes on `{ companyId, ... }` keep queries fast. Isolation is enforced in
the application layer via a mandatory query plugin (below) + tests.

---

## 3. Database schema changes

### 3.1 New model — `Company` (tenant root) `/server/models/Company.js`
```js
{
  name:            { type: String, required: true, trim: true },
  slug:            { type: String, required: true, unique: true, lowercase: true, index: true }, // tenant resolver key
  status:          { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  // Branding + statutory config land in Epic C; stubbed here:
  branding:        { logoUrl: String, letterheadUrl: String },
  contactEmail:    { type: String, trim: true },
  createdBy:       { type: ObjectId, ref: 'User', default: null } // superadmin or self-signup
}  // timestamps
```
`slug` is the tenant resolver (e.g. `acme` → header `X-Company: acme` or `acme.app.com`).

### 3.2 Add `companyId` to every tenant-scoped model
Models touched: `User`, `OfferLetter`, `EmployeeSalaryAssignment`,
`SalaryStructureTemplate`, `SalarySlip` (and every future model).
```js
companyId: { type: ObjectId, ref: 'Company', required: true, index: true }
```

### 3.3 Index changes (breaking — require migration)
| Model | Was | Becomes |
|-------|-----|---------|
| `User.email` | `unique: true` (global) | compound **`{ companyId: 1, email: 1 } unique`** (email drops standalone unique) |
| `User.employeeId` | `unique, sparse` (global) | compound **`{ companyId: 1, 'employeeDetails.employeeId': 1 } unique, sparse`** |
| `SalaryStructureTemplate.name` | `unique` (global) | **`{ companyId: 1, name: 1 } unique`** |
| `SalarySlip` | `{ employeeId, month, year } unique` | **`{ companyId, employeeId, month, year } unique`** |
| text/search indexes | global | prefix with `companyId` where used for lookups |

### 3.4 Roles
`User.role` enum gains **`superadmin`**: `['superadmin', 'admin', 'hr', 'employee']`.
`superadmin` belongs to a reserved **platform company** and is exempt from tenant scoping.

---

## 4. Isolation mechanism (the core of the epic)

### 4.1 Request-scoped tenant context
An `AsyncLocalStorage` store holds `{ companyId, role }` for the lifetime of a request.
`verifyToken` (and the candidate/tenant resolver) populate it. Nothing else reads
`req` for tenancy — the store is the single source of truth, so services and models
don't need `req` threaded through.

### 4.2 Mongoose `tenantScope` plugin (applied to every tenant-scoped schema)
- **On queries** (`find`, `findOne`, `count*`, `update*`, `delete*`, `findOneAndUpdate`, …):
  inject `companyId = <ctx.companyId>` into the filter via a `pre` hook — unless the
  actor is `superadmin` **and** explicitly opts out.
- **On `aggregate`**: unshift a `$match: { companyId }` stage.
- **On `save`/`insertMany`**: default `companyId` from context if unset; **throw** if a
  doc's `companyId` mismatches the context (guards against cross-tenant writes).
- **Escape hatch:** `Model.find(...).byPassTenant()` (query helper) usable only when
  `ctx.role === 'superadmin'`; logs a warning. Used by platform/admin tooling only.

```js
// server/models/plugins/tenantScope.js  (sketch)
export default function tenantScope(schema) {
  const applyFilter = function () {
    if (this.getOptions?.().skipTenant) return;
    const ctx = tenantContext.get();          // AsyncLocalStorage
    if (!ctx) throw new ApiError(500, 'No tenant context');
    if (ctx.role === 'superadmin' && this.getOptions?.().allowCrossTenant) return;
    const f = this.getFilter();
    if (f.companyId == null) this.where({ companyId: ctx.companyId });
  };
  ['find','findOne','count','countDocuments','updateOne','updateMany',
   'deleteOne','deleteMany','findOneAndUpdate','findOneAndDelete']
    .forEach((op) => schema.pre(op, applyFilter));
  schema.pre('save', function (next) {
    const ctx = tenantContext.get();
    if (!this.companyId && ctx) this.companyId = ctx.companyId;
    if (ctx && ctx.role !== 'superadmin' && String(this.companyId) !== String(ctx.companyId))
      return next(new ApiError(403, 'Cross-tenant write blocked'));
    next();
  });
}
```

### 4.3 Why a plugin, not per-controller filters
Controllers today call `User.find(filter)` with no scope (e.g.
`userController`, `offerController`, `payslipController`). Auditing every call site is
error-prone; a default-on plugin makes the safe path the *only* path and localizes the
security-critical logic to one tested file.

---

## 5. Auth redesign

### 5.1 Tenant resolution on login
Login must know the company. Chosen approach: **explicit company code/slug**.
`POST /api/auth/login { companySlug, email, password }`:
1. Resolve `Company` by `slug` (404-generic on miss).
2. `User.findOne({ companyId: company._id, email })` **with tenant context set to that
   company** (login runs before a token exists, so it sets context manually).
3. On success, `signToken` embeds `companyId`.

*(Alternative resolvers — subdomain, `X-Company` header — can replace step 1 later
without touching the rest.)*

### 5.2 JWT claims
`signToken` payload becomes `{ sub, role, email, companyId }`.
`verifyToken`:
1. Verify JWT → read `companyId`.
2. Set `tenantContext` = `{ companyId, role }` for the request (via ALS `run`).
3. Load user (now auto-scoped) + verify `company.status === 'active'`.
4. Attach `req.user`; keep `authorizeRoles` unchanged.

### 5.3 Superadmin
- Lives in a reserved platform company (`slug: '_platform'`), seeded once.
- `verifyToken` sets `ctx.role='superadmin'`; plugin lets superadmin opt out of scope
  for tenant-management endpoints only.

---

## 6. Tenant onboarding

- **Superadmin-provisioned** (`POST /api/tenants`) **or self-signup**
  (`POST /api/public/signup`): creates `Company` + its first `admin` user in one
  transaction, then seeds per-tenant defaults (salary templates, document types).
- Per-tenant **seed** replaces the current global `seed.js`: `seedTenant(companyId)`.

---

## 7. File storage isolation
- Uploads move from `uploads/documents/<uuid>` to **`uploads/<companyId>/documents/<uuid>`**.
- Authorized download route (`GET /api/documents/:id`) already checks ownership; add a
  tenant check (record's `companyId` must equal `ctx.companyId`).
- Avatars similarly namespaced; static-serve path updated.

---

## 8. Candidate / magic-link flow
- Offers carry `companyId`. The public `GET/POST /api/candidate/offer/:token` resolves
  the tenant **from the offer record** and sets `tenantContext` for that request
  (no login needed). Low-touch since the flow is already token-scoped.
- Provisioning/emails read branding from the offer's `Company`.

---

## 9. REST API contract changes

| Endpoint | Change |
|----------|--------|
| `POST /api/auth/login` | body adds `companySlug`; response user includes `companyId` |
| `GET /api/auth/me` | returns `company` summary alongside `user` |
| `POST /api/tenants` | **new** (superadmin) — create a company + first admin |
| `GET /api/tenants` | **new** (superadmin) — list/manage tenants |
| `POST /api/public/signup` | **new** (optional) — self-serve company signup |
| all existing tenant routes | unchanged URLs; now implicitly tenant-scoped |

---

## 10. Data migration (existing single-tenant data)

Idempotent migration script `server/scripts/migrate-to-multitenant.js`:
1. Create a **default company** (`slug: 'legacy'`, name from env/current branding).
2. Backfill `companyId = legacyCompany._id` on **all** existing `User`, `OfferLetter`,
   `EmployeeSalaryAssignment`, `SalaryStructureTemplate`, `SalarySlip` docs.
3. Drop old global unique indexes; build new compound indexes.
4. Move existing upload files into `uploads/<legacyId>/…`; rewrite stored `fileUrl`s.
5. Seed the reserved `_platform` company + one `superadmin` (creds via env).
Run order matters: **backfill before** creating the new unique indexes (else null
`companyId` collisions).

---

## 11. Test strategy (isolation is security-critical)
- **Plugin unit tests:** query without context → throws; with context → filter injected;
  cross-tenant `save` → 403; superadmin bypass works only for superadmin.
- **Isolation integration tests:** seed two companies A & B; assert a user in A cannot
  read/update/delete B's users, offers, payslips, templates, documents (list, get-by-id,
  PATCH, DELETE, PDF stream all return 403/404, never B's data).
- **Auth tests:** same email in A and B logs into the correct tenant; wrong `companySlug`
  fails generically; JWT carries `companyId`.
- **Migration test:** run against seeded legacy data → all docs get `companyId`, indexes
  rebuilt, no orphans.
- Update **all existing tests** to create a company + set context/login with `companySlug`
  (add a `withTenant()` test helper).

---

## 12. User stories & acceptance criteria

- **T.1 Company model + tenant context** — `Company` model, `AsyncLocalStorage` context, wired in `verifyToken`.
  *AC:* every authed request has `ctx.companyId`; missing context on a scoped query throws 500 (fail-closed).
- **T.2 tenantScope plugin** — applied to all scoped models.
  *AC:* plugin unit tests green; a query with no explicit `companyId` is auto-filtered.
- **T.3 `companyId` on all models + compound indexes.**
  *AC:* schemas updated; duplicate email allowed across companies, blocked within one.
- **T.4 Auth redesign** — `companySlug` login, `companyId` in JWT, superadmin role.
  *AC:* cross-tenant login isolation test green.
- **T.5 Tenant onboarding + per-tenant seed** — `POST /api/tenants` (+ optional signup).
  *AC:* creating a tenant yields a working admin login and default templates.
- **T.6 File-storage isolation** — per-company upload paths + tenant check on download.
  *AC:* company A cannot fetch company B's document by id.
- **T.7 Candidate flow tenant resolution** — offers carry `companyId`; magic link resolves tenant.
  *AC:* candidate sign/approve provisions the user into the correct company.
- **T.8 Migration script** — backfill legacy data.
  *AC:* migration test green; re-running is a no-op.

---

## 13. Rollout sequence (implementation)
1. T.1 + T.2 (context + plugin) behind tests — no behavior change yet.
2. T.3 add `companyId` + indexes (nullable first), then T.8 migration to backfill, then make required.
3. T.4 auth redesign + update client login (add company code field).
4. T.6, T.7 (files, candidate).
5. T.5 onboarding + superadmin console (minimal UI).
6. Flip plugin to **fail-closed** (throw when no context) and delete any now-dead manual filters.

---

## 14. Risks & mitigations
- **Cross-tenant leak** → centralized plugin + dedicated isolation test matrix; fail-closed.
- **Missed query op in plugin hook list** → enumerate all Mongoose write/read ops; add a
  lint/test that every scoped model has the plugin.
- **Migration on live data** → idempotent, backfill-before-index, dry-run mode + backup.
- **Client login friction (company code)** → remember last `companySlug` in localStorage;
  subdomain resolver as a later enhancement.
