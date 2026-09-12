# ARCHITECTURE_AUDIT.md — MIRUS Mobile Field-Force App: Milestone 1

Status: **Audit only. No code or database changes made.** Produced by inspecting the actual
source in `/server` and `/client`, and the mobile demo `mirus_app_v7.html`. Do not treat
anything in prior planning docs (`FEATURE_GAP_ANALYSIS.md`, `EPIC_T_MULTITENANCY_DESIGN.md`,
`mongoose_models.md`) as ground truth where it conflicts with what's below — those are
design-time documents and in at least one case (multi-tenancy) predate/undersell what's
actually implemented, and in another case (pharma scope) contradicts this very request.

---

## 1. Existing Architecture

### Backend (`/server`)
- **Stack**: Node.js, Express, Mongoose/MongoDB, JWT auth, MVC-ish (`routes/ → controllers/ → models/`), `services/` for cross-cutting logic (e.g. `activityService`), `middleware/`, `validators/`.
- **Bootstrap**: `server.js` → `connectDB()` → `app.listen`. `app.js` middleware order: `cors()` → `express.json` → `express.urlencoded` → `cookieParser` → `tenantContextMiddleware` (opens an `AsyncLocalStorage` store per request) → public `/uploads` static → `/api/health` → ~23 versioned route mounts → `notFound` → `errorHandler`.
- **Database**: one shared MongoDB database/connection for *all* tenants (`config/db.js`, `MONGO_URI`). No per-tenant DB or connection.
- **Auth**: `POST /api/auth/login` takes `{ companySlug, identifier|email, password }`. Resolves `Company` by slug first, then the user scoped to that company, then bcrypt-compares. JWT payload is `{ sub, role, email, companyId }`, signed with `JWT_SECRET`, default expiry `1d`. Delivered as an **HTTP-only cookie** (`hrms_token` by default) — **the raw token is never returned in the JSON response body**. `verifyToken` middleware accepts **either** the cookie **or** an `Authorization: Bearer <jwt>` header, in that order — so bearer-token auth is already wired server-side, but nothing currently hands a mobile client a token to put in that header.
- **Authorization**: role enum is exactly `['superadmin','admin','hr','employee']` (`models/User.js`). Primary mechanism is permission-based (`config/permissions.js` + `requirePermission()`), not raw role checks — `superadmin` gets `['*']`, `admin` gets nearly everything except `TENANT_MANAGE`, `hr` gets an operational subset, `employee` gets `[]` (relies on self-service/ownership-checked routes). A legacy `authorizeRoles()` also exists but is not the dominant pattern.
- **Multi-tenancy**: **fully implemented**, not just designed. Every tenant-scoped model carries `companyId` and uses a shared `models/plugins/tenantScope.js` Mongoose plugin that (a) injects `companyId` into every query/aggregate automatically from request-scoped `AsyncLocalStorage` context, (b) blocks any save whose `companyId` disagrees with that context, (c) never trusts client-supplied `companyId`. Context is populated only from the verified JWT (`verifyToken`) or from the server-resolved `Company` during login — never from client input. `Company` itself is the (non-scoped) tenant root, resolved by `slug`.
- **Testing**: Node's built-in `node:test` + `supertest` + `mongodb-memory-server` (real in-memory Mongo, not mocks). Factory helpers (`createUser`, `createCompany`, `authAgent`, `runInTenant`) in `tests/helpers/`. No `attendance.test.js` or `leave.test.js` currently exists.
- **Seed safety**: `npm run db:seed` runs `mongoose.connection.dropDatabase()` unconditionally — **fully destructive, must never touch the client's real database**. `npm run db:seed:admin` and `npm run db:setup` are idempotent/non-destructive upserts, safe for provisioning a dev/test tenant.

### Frontend (`/client`)
- React 19 + Vite, Redux Toolkit (only two slices: `auth`, `toast` — most features use local/component state), React Router v6, MUI + Tailwind side-by-side with a shared theme.
- **Auth state**: cookie-only. No token is ever stored in Redux/localStorage/sessionStorage; axios uses `withCredentials: true` and a relative `baseURL: '/api'`. Session restore on load is `GET /api/auth/me`.
- **Roles surfaced in UI**: only `admin`, `hr`, `employee` — the web client has no concept of `superadmin`, let alone any field-force hierarchy.
- **Brand identity**: actual palette is **orange `#E89000` / charcoal-grey `#707070`/`#3F3F3F`** (`client/src/config/brand.js`, `tailwind.config.js`), **not** the navy `#1B2A5C`/orange `#E8820C` scheme used by both `CLAUDE.md` and the mobile demo file. This is a real discrepancy — see Risks (§10).
- Attendance and Leave are real, working, tested-by-usage features on both ends already (`features/attendance/*`, `/api/attendance/*`, `/api/leaves/*`, `/api/holidays/*`) — solid ground to build on.

---

## 2. Mobile Feature Inventory (from `mirus_app_v7.html`, 34 screens)

Login · BDM Dashboard (punch in/out, quick actions, today's plan, alerts, DCR status, secondary sales/stockist) · DCR list · DCR individual-call form · DCR joint-call form · MTP (view/summary) · MTP submit-for-approval · MTP pending/status+timeline · Doctors list (BDM, view-only) · Expenses summary · Add expense · Alerts · More (BDM) · Manager dashboard (ASM/RBM/ZBM shared) · Manager doctor list management (CSV upload, manual add, assign/reassign) · Manager approvals (MTP/expense/leave) · Manager team (BDM performance) · Manager more · Manager field call (no-BDM-in-area visit logging) · Team attendance (manager view) · Manager work type · Admin dashboard · Admin ZBM/RBM/ASM/BDM activity monitors (4 separate drill-down screens) · Admin user management · Admin live monitor · Admin reports · Admin all-roles attendance · Admin more · NSM dashboard · NSM (ZBM) attendance · NSM more · BDM daily work type (individual/joint/camp/meeting/sick-leave/planned-leave) · Status calendar (BDM, month grid with day-detail).

All numeric data in the demo (visit counts, ₹ amounts, percentages, names) is **hardcoded mock data for UI demonstration only** and must not be treated as real business rules or seeded anywhere.

The demo's own login screen is a **pure client-side role-picker mock** — `doLogin()` just branches on a dropdown selection and swaps in canned name/avatar text; there is no real credential check, and the role is *chosen by the user*, not authenticated. The real mobile app must instead call the real `POST /api/auth/login` and take the role from the server's response, never from client UI state.

The demo's punch in/out is also **pure client-side JS** (toggles a boolean, no network call) — real implementation must hit an actual attendance endpoint.

---

## 3. Role Hierarchy — Corrected Naming vs. Demo Naming

Per the mandated hierarchy:
```
Admin → NSM → ZSM → RSM → ASM → BDM
```
The demo file itself uses the **old** naming (`RBM` = "Regional Business Mgr", `ZBM` = "Zonal Business Manager") throughout its markup, CSS classes (`tag-rbm`, `tag-zbm`), and JS (`mgrConfig`, `roleData`). This is a straightforward 1:1 rename to apply when building the real app — **not** a structural difference:
```
ZBM  →  ZSM   (Zonal Sales Manager)
RBM  →  RSM   (Regional Sales Manager)
```
ASM, BDM, NSM, Admin are already named correctly in the demo. This mapping is applied everywhere below and should be applied to all new code, labels, enum values, and API fields — never `RBM`/`ZBM`/generic "Manager".

**Critical finding**: none of `NSM/ZSM/RSM/ASM/BDM` exist anywhere in the current backend's `User.role` enum (`superadmin/admin/hr/employee`), nor in the web client. This hierarchy is a **new dimension** that must be added without disturbing the existing HRMS role/permission system — see §7 (Missing Domains) and the open question in §10.

---

## 4. Feature Reuse Matrix

| Feature | Existing HRMS support | Classification | Action |
|---|---|---|---|
| Authentication (company code/email/employee-ID + password, JWT) | Yes | EXISTING, needs one small EXTENSION | Reuse `POST /api/auth/login`; add returning the raw token in the JSON body (additive, gated) so mobile can use `Authorization: Bearer` — see §10 open question |
| Multi-tenancy / companyId scoping | Yes, fully implemented | EXISTING | Reuse as-is; new models just add `companyId` + `tenantScope` plugin |
| User/Employee master, reportingManagerId | Yes | EXISTING | Reuse `User` model; `employeeDetails.reportingManagerId` already models a manager chain — reusable for the NSM→ZSM→RSM→ASM→BDM hierarchy (see §7) |
| Attendance (whole-day status, `checkIn`/`checkOut` free-text) | Yes | EXTENSION | Reuse `Attendance` model/API; extend for true timestamped punch in/out if the business needs it (see open question) |
| Leave (apply/list/cancel/decision) | Yes | EXISTING | Reuse `/api/leaves/*`; confirm existing leave-type enum vs demo's CL/PL/SL labels (open question) |
| Holidays | Yes | EXISTING | Reuse `/api/holidays` for the status calendar |
| Activity/audit log | Yes (`Activity` model + `logActivity()`) | EXISTING | Reuse for DCR/MTP/Expense state-change auditing instead of a new audit mechanism |
| Authorized file serving by id | Yes (pattern in `uploadedDocumentController.js`) | EXISTING pattern | Reuse pattern for expense receipts, doctor CSV imports, DCR attachments |
| Doctors / Contacts | No | NEW | New tenant-scoped model + CRUD + CSV import + BDM assignment |
| DCR (Daily Call Report), incl. joint calls | No | NEW | New tenant-scoped model(s) |
| MTP (Monthly Tour Plan) + approval workflow | No | NEW | New tenant-scoped model + approval state machine |
| Expenses (TA/DA) + approval | No | NEW | New tenant-scoped model; reuse file-upload pattern for receipts |
| Manager Field Call | No | NEW | New tenant-scoped model (or a `loggedByRole` flag on DCR — open design question) |
| Work Type (daily) | No | NEW, but its `sick`/`leave` sub-options should **not** duplicate the Leave module | New model for field/office work types; route sick/planned-leave selections into the **existing** Leave API rather than storing leave data twice |
| Stockist / Secondary Sales | No | NEW | New tenant-scoped model(s) |
| Alerts (doctor birthdays/anniversaries) | No | NEW (small) | Derived query off the new Doctor model's date fields |
| Status Calendar | Partial | EXTENSION | New read-only aggregation combining existing Attendance + Leave + Holiday with new DCR/WorkType data |
| Manager/Admin/NSM monitoring & reports (DCR %, MTP adherence, expense totals, doctor coverage, zone/region roll-ups) | No | NEW | New aggregation endpoints over the new models, scoped by the hierarchy |
| Admin user management by role (ZSM/RSM/ASM/BDM counts, CRUD) | Partially (User CRUD exists) | EXTENSION | Reuse `User` CRUD; extend to filter/display by the new hierarchy field |

---

## 5. Existing APIs Confirmed Reusable As-Is

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/attendance/mark`, `GET /api/attendance/mine`, `POST /api/attendance`, `POST /api/attendance/bulk`, `POST /api/attendance/bulk-upload`, `GET /api/attendance`
- `POST /api/leaves`, `GET /api/leaves/mine`, `PATCH /api/leaves/:id/cancel`, `GET /api/leaves`, `PATCH /api/leaves/:id/decision`
- `GET /api/holidays`, `POST /api/holidays`, `DELETE /api/holidays/:id`
- `logActivity()` service for audit trails
- Authorized document-serving pattern (`GET /api/uploaded-docs/:id/pdf`-style ownership check) as the template for any new file-serving route

---

## 6. Missing Domains (confirmed absent by direct source inspection — grepped model files and schema content)

None of the following exist anywhere in the repository:
- Doctor / Contact
- DCR / Call Report
- MTP / Tour Plan
- Expense
- Manager Field Call
- Work Type
- Stockist
- Secondary Sale

This is a pure corporate-HR backend today (onboarding, payroll, documents, performance, assets, exits, offer letters) — there is nothing pharma-field-force-shaped to reuse beyond the generic User/Attendance/Leave/Activity/file-upload infrastructure named above.

---

## 7. Proposed Mobile Architecture

```
Mobile Application (React Native + Expo)
        │  HTTPS REST, Authorization: Bearer <jwt>
        ▼
Existing Express backend (/server) — same app, same port, additive routes/controllers/models only
        │  Mongoose, tenantScope plugin (unchanged mechanism)
        ▼
Existing MongoDB (same database, same connection) — new collections only, no changes to existing ones
```

- No second backend, no second database, no direct Mongo access from the mobile app.
- New domain models (Doctor, DCR, MTP, Expense, ManagerFieldCall, WorkType, Stockist, SecondarySale) follow the exact same pattern as every existing tenant-scoped model: a `companyId` field + `.plugin(tenantScope)`, so isolation is automatic and consistent with the rest of the system.
- Hierarchy modeling: reuse `employeeDetails.reportingManagerId` (already on `User`) to encode BDM→ASM→RSM→ZSM→NSM chains, plus a new field to record which tier of the hierarchy a user occupies (see open question in §10 — this needs a decision before schema work starts).
- Authorization for new mobile endpoints: extend `config/permissions.js` with new permissions (e.g. `DCR_SUBMIT`, `MTP_APPROVE`, `EXPENSE_APPROVE`, `DOCTOR_MANAGE`) rather than inventing a parallel authorization system.

---

## 8. Database Safety Plan (summary — full detail in `MOBILE_DATABASE_SAFETY.md`)

- **Zero changes** to any existing collection's required fields, indexes (other than possibly adding a new optional field), or documents.
- All new functionality lands in **new collections only**.
- The one schema question that *could* touch an existing collection is where to record each user's field-force hierarchy tier — proposed as a new, optional, additive sub-document on `User` (see open question below), never a rename/removal of anything existing.
- `npm run db:seed` will not be run against any database this work is meant to protect. Any test data uses `db:seed:admin`/`db:setup` or a separate local/dev database.

---

## 9. Exact Files/Directories Expected (once implementation is approved — not created yet)

**Backend (additive only):**
```
server/models/Doctor.js
server/models/DailyCallReport.js        (or Dcr.js — individual + joint call entries)
server/models/MonthlyTourPlan.js
server/models/Expense.js
server/models/ManagerFieldCall.js
server/models/WorkType.js               (daily work-type log)
server/models/Stockist.js
server/models/SecondarySale.js
server/controllers/*Controller.js        (one per new model)
server/routes/*Routes.js                 (mounted additively in app.js)
server/validators/*.js                   (express-validator schemas per new endpoint)
server/config/permissions.js             (extended, not replaced)
```

**Mobile (new package, does not touch `/client`):**
```
mobile/                (React Native + Expo)
mobile/src/navigation/ (role-aware navigators per hierarchy tier)
mobile/src/api/        (axios/fetch client, Bearer-token storage via expo-secure-store)
mobile/src/screens/    (BDM, Manager, NSM, Admin screen trees)
mobile/src/components/ (reusable cards, badges, forms — rebuilt for RN, not ported HTML)
mobile/src/theme/      (design tokens — brand-color decision needed, see §10)
```

---

## 10. Risks / Open Questions (must be resolved before implementation — not assumed)

1. **Scope contradiction**: `FEATURE_GAP_ANALYSIS.md` explicitly states *"pharma field-force vertical is out of scope (Epic 15 dropped)"* as a confirmed client scope decision. This mobile app is exactly that vertical. Please confirm this is an intentional reversal of that decision before backend work begins.
2. **Hierarchy modeling**: should NSM/ZSM/RSM/ASM/BDM be (a) new values appended to the existing `User.role` enum (simplest, but conflates HRMS permission role with field-force tier — a BDM is also just an `employee` for payroll/leave purposes), or (b) a separate field (e.g. `employeeDetails.salesHierarchy: { tier, reportsToId }`) layered alongside the existing `role`? Option (b) is recommended as the safer, additive path but needs sign-off since it affects every new model's authorization checks.
3. **Auth token delivery for mobile**: `verifyToken` already accepts `Authorization: Bearer`, but `POST /api/auth/login` never returns the raw JWT in its JSON body (cookie-only). A small, additive change is needed (return the token in the body only when the request indicates a mobile client, e.g. a header or `platform` field) — confirm this approach doesn't weaken web security expectations.
4. **Attendance model shape**: current `Attendance` records a whole-day status with free-text `checkIn`/`checkOut`, not real-time timestamped punches. Confirm whether the mobile "Punch In/Punch Out" needs true timestamp + (optional) geolocation semantics, which would need an additive schema extension, or whether the existing daily-status model is acceptable.
5. **Leave-type mapping**: demo uses `CL/PL/SL`; the existing `LeaveRequest.type` enum (per frontend audit) is `Casual/Sick/Earned/Unpaid/Maternity/Other`. Confirm the mapping (`CL→Casual`, `PL→Earned`?, `SL→Sick`) rather than inventing new leave types that fragment the existing leave system.
6. **Manager Field Call vs. DCR**: is a manager's own doctor visit a genuinely separate entity, or a DCR record with a `loggedByRole` discriminator? The demo treats it as visually distinct and separately reported to Admin — leaning toward a separate lightweight model, but this is a design call, not an inspection fact.
7. **Brand palette conflict**: the demo (and `CLAUDE.md`) use navy `#1B2A5C`/orange `#E8820C`; the actual live HRMS web app uses orange `#E89000`/charcoal `#707070`. Confirm which palette the mobile app should follow — visual consistency with the demo, or with the already-shipped web product.
8. **Doctor "ownership"**: the demo shows ASM/RSM uploading and assigning doctors to BDMs, and BDM only viewing (read-only) their assigned list. Assignment rules (can a doctor be assigned to more than one BDM? reassignment history?) are not specified anywhere and should not be invented silently.
9. **Approval hierarchy exact rule**: the demo shows a BDM submitting MTP "to" a specific manager they pick from a list (not always their direct ASM). Confirm whether approval routing should be strictly the reporting-manager chain (safer, server-determined) or user-selectable as the demo UI suggests (which would need care to avoid letting a client pick an unauthorized approver).

---

**No code, schema, or database changes have been made. Per the mandated workflow, this stops here for review before Milestone 2 (Feature Mapping) detail work or any implementation begins.**
