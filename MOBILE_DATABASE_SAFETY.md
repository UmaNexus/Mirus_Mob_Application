# MOBILE_DATABASE_SAFETY.md — Milestone 3

No migration, schema change, or database write has been executed. This document is the
safety plan to be reviewed before any `server/models/*.js` file is touched.

---

## 1. Existing collections — change summary

| Collection | Change | Type | Existing documents affected? | Migration required? | Rollback |
|---|---|---|---|---|---|
| `users` | Add optional `employeeDetails.fieldForce: { tier: enum, territory: String }` | **Additive** | No — field is optional/undefined by default on existing docs | No (Mongoose adds the field lazily; no backfill needed since absence means "not a field-force user") | Drop the field via a one-off unset script if ever needed; no data loss since it's new |
| `attendance` | Add optional `punchInAt: Date`, `punchOutAt: Date`, `punchInLocation`/`punchOutLocation: {lat,lng}` | **Additive** | No — existing whole-day records keep working with `status`/`checkIn`/`checkOut` untouched | No | Unset the new fields if needed; existing status-based logic is unaffected either way |
| `leaverequests` | None | — | — | — | — |
| `holidays` | None | — | — | — | — |
| everything else (Company, Department, JobRole, Activity, Asset, CFIssue, CFTemplate, DocumentType, EmployeeDocument*, EmployeeSalaryAssignment, ExitRecord, LetterTemplate, OfferLetter, PerformanceReview, SalarySlip, SalaryStructureTemplate, performanceExtras, trainingLibrary) | **None** | — | — | — | — |

No existing collection has a field renamed, removed, or made stricter. No existing index is dropped. No existing required-field constraint changes.

---

## 2. New collections (all tenant-scoped: `companyId` + `.plugin(tenantScope)`, matching the existing pattern exactly)

| Collection | Core fields (sketch) | Key indexes |
|---|---|---|
| `doctors` | companyId, name, speciality, area, phone, dob, anniversaryDate, assignedTo (ref User, single BDM), createdBy | `{companyId,assignedTo}`, `{companyId,name:'text'}` |
| `dailycallreports` | companyId, userId (BDM), date, type(individual\|joint), doctorId, accompaniedByUserId (nullable), productsDetailed[], samplesGiven[], feedback, status(pending\|done\|missed), submittedAt | `{companyId,userId,date}` |
| `monthlytourplans` | companyId, userId (BDM), month, plannedVisits[{doctorId,week,date}], status(draft\|pending\|approved\|rejected\|withdrawn), approverId (server-computed), submittedAt, decidedAt, decisionNote | `{companyId,userId,month}` unique |
| `expenses` | companyId, userId, category(enum), date, stationType, from, to, modeOfTravel, amount, receiptFileUrl, status(pending\|approved\|rejected), approverId | `{companyId,userId,date}` |
| `managerfieldcalls` | companyId, userId (manager), tier, doctorId/contactName, visitType, reason, feedback, loggedAt | `{companyId,userId,loggedAt}` |
| `worktypes` | companyId, userId, date, type(enum: individual,joint,camp,meeting,sick,leave,fieldcall,jointcall), details (Mixed, per-type sub-fields), linkedLeaveRequestId (nullable, set when type is sick/leave) | `{companyId,userId,date}` unique |
| `stockists` | companyId, userId (BDM), name, lastOrderAmount, lastOrderDate, status | `{companyId,userId}` |
| `secondarysales` | companyId, userId, stockistId, productBatch, expiryDate, quantity, value | `{companyId,userId}` |

All eight are new collections. None of them share a name or purpose with any existing collection — no ambiguity about "is this the same entity as X."

---

## 3. Explicitly ruled out

- No dropping of any collection or the database.
- No `npm run db:seed` execution against any shared/dev/production database — that script remains understood as fully destructive (`dropDatabase()`) and is not part of this work.
- No second MongoDB database or connection for mobile.
- No duplicate `MobileUser`/`MobileAttendance`/`MobileLeave` collections — mobile reuses `users`, `attendance`, `leaverequests`, `holidays` directly through the same API.
- No change to the `tenantScope` plugin mechanism itself — new models simply adopt it, unchanged.
- No change to `User.role` enum (`superadmin/admin/hr/employee` stays exactly as-is, per decision #2).

---

## 4. Rollback strategy

Because every change is additive (new optional fields on two existing collections, entirely new collections otherwise), rollback in the worst case is: stop writing to the new fields/collections and optionally drop the new collections — existing HRMS functionality (auth, attendance, leave, payroll, documents, onboarding, offers, performance, assets, exits) is never in the write path of any new code, so there is no scenario where a mobile-app bug can corrupt existing HR data structurally. The one shared write path is `Attendance` (additive fields only) — a bug there could at worst leave `punchInAt`/`punchOutAt` incorrect on a record whose `status`/`checkIn`/`checkOut` remain correct, so existing attendance reporting logic (which reads the pre-existing fields) is unaffected even in a failure case.

---

## 5. Before writing any model file

- Confirm dev/staging points at a database that is **not** the client's production data.
- Any test fixtures go through `db:seed:admin`/`db:setup` (idempotent) or `mongodb-memory-server` in automated tests — never `db:seed`.
- New model files add tests under `server/tests/` following the existing `authAgent`/`runInTenant` factory pattern before the corresponding controller is considered done, since attendance/leave currently have no test coverage to imitate but the newer modules (auth, tenancy, rbac) do.

---

This closes Milestone 3. Next step (Milestone 4) is backend implementation, one domain at a time, starting with the `fieldForce` field on `User` + permissions scaffolding, then `Doctor`, then `DailyCallReport`, per the dependency order in `CLAUDE.md` §36 — each verified by tests before moving to the next domain, with a git commit after each fully verified user story.
