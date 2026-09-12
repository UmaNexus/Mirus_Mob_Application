# MOBILE_FEATURE_MAPPING.md — Milestone 2

Builds on [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md) with the client's decisions applied:

| # | Decision | Applied as |
|---|---|---|
| 1 | Pharma field-force is in scope | This mapping proceeds |
| 2 | Hierarchy is a separate additive field | `User.employeeDetails.fieldForce = { tier, territory }` (new optional sub-doc). `tier` enum: `NSM, ZSM, RSM, ASM, BDM`. The reporting *chain* reuses the existing `employeeDetails.reportingManagerId` — no duplicate manager-link field. `role` stays `admin/hr/employee` for HRMS permissions; field-force employees are `role: 'employee'` **plus** a `fieldForce.tier`. Admin/NSM users who need HRMS-side elevated access keep whatever `role` they already have. |
| 3 | Mobile-safe token response | `POST /api/auth/login` gains an additive `mobileToken` field in the JSON body, returned **only** when the request carries a new header (e.g. `X-Client: mobile`) or a body flag — web behavior (cookie-only, no token in body) is unchanged when that signal is absent |
| 4 | Real timestamped punches | `Attendance` gets additive `punchInAt: Date`, `punchOutAt: Date`, optional `punchInLocation`/`punchOutLocation: {lat,lng}` — existing `checkIn`/`checkOut` strings and `status` enum untouched |
| 5 | Leave types unresolved | Mobile leave screens use the **existing** `LeaveRequest.type` enum values as-is; UI must not introduce CL/PL/SL as new backend values. If client later confirms a CL/PL/SL mapping, it's a UI label change only, not a schema change |
| 6 | Manager Field Call = separate model | `ManagerFieldCall` is its own collection, not a DCR variant |
| 7 | Use live HRMS brand | Mobile theme tokens = orange `#E89000` / charcoal `#707070`/`#3F3F3F` (from `client/src/config/brand.js` / `tailwind.config.js`), not the demo's navy/orange |
| 8 | One primary BDM per doctor | `Doctor.assignedTo: ObjectId (ref User)`, single value; reassignment recorded via `Activity` log (existing audit mechanism), not a new history array — revisit only if the client asks for full reassignment history later |
| 9 | Strict reporting hierarchy for approvals | MTP/Expense `approverId` is **server-computed** from the submitter's `employeeDetails.reportingManagerId` at submission time — the mobile UI must not let the user pick an approver (unlike the demo's manager-picker dropdown) |

---

## Feature → API Matrix

| Feature | Existing endpoint? | New endpoint | Method | Model | Permission (new) | Role(s) | Notes |
|---|---|---|---|---|---|---|---|
| Login (company code + identifier + password) | Yes, `POST /api/auth/login` | — (extend response only) | POST | `User`, `Company` | none (existing) | all | Returns `fieldForce.tier` in `user` payload so mobile can route navigation |
| Session check | Yes, `GET /api/auth/me` | — | GET | — | none | all | unchanged |
| Punch In | Extend | `POST /api/attendance/punch-in` | POST | `Attendance` (extended) | `ATTENDANCE_PUNCH` | BDM, ASM, RSM, ZSM, NSM | Sets `punchInAt` (+location if enabled); upserts today's `Attendance` doc |
| Punch Out | Extend | `POST /api/attendance/punch-out` | POST | `Attendance` (extended) | `ATTENDANCE_PUNCH` | same | Sets `punchOutAt`, computes `workedHours` |
| Team/company attendance views | Yes, `GET /api/attendance` | — (add hierarchy filter) | GET | `Attendance` | `ATTENDANCE_MANAGE` (existing) or new `FIELDOPS_MONITOR` | ASM+, Admin | Scope by hierarchy: manager sees only their reporting subtree |
| Leave apply/list/cancel | Yes | — | — | `LeaveRequest` | none (existing) | all | Reused verbatim; "Work Type → sick/planned leave" sub-flow calls this API, does not write its own leave record |
| Leave approvals | Yes | — | — | `LeaveRequest` | `LEAVE_APPROVE` (existing) | ASM+ | Reused verbatim |
| Holidays / status calendar base data | Yes | — | — | `Holiday` | none | all | Reused verbatim |
| Doctor list (BDM view-only) | No | `GET /api/doctors/mine` | GET | `Doctor` (new) | `DOCTOR_VIEW` | BDM | Filtered to `assignedTo = self` |
| Doctor list management (ASM+) | No | `GET/POST/PATCH /api/doctors` | GET/POST/PATCH | `Doctor` (new) | `DOCTOR_MANAGE` | ASM, RSM, ZSM | Scoped to own reporting subtree's BDMs |
| Doctor CSV import | No | `POST /api/doctors/import` | POST | `Doctor` (new) | `DOCTOR_MANAGE` | ASM+ | Reuses existing Multer/UUID upload pattern; parses server-side, never stores raw path |
| Doctor birthday/anniversary alerts | No | `GET /api/doctors/alerts` | GET | `Doctor` (new) | `DOCTOR_VIEW` | BDM | Derived query off `Doctor.dob`/`anniversaryDate`, no new model |
| DCR — log individual call | No | `POST /api/dcr` | POST | `DailyCallReport` (new) | `DCR_SUBMIT` | BDM | |
| DCR — log joint call | No | `POST /api/dcr` (`type: 'joint'`) | POST | `DailyCallReport` (new) | `DCR_SUBMIT` | BDM | `accompaniedBy` must be a valid manager in the BDM's own reporting chain (server-validated) |
| DCR — list/status/submit day | No | `GET /api/dcr`, `PATCH /api/dcr/:id/submit` | GET/PATCH | `DailyCallReport` (new) | `DCR_SUBMIT` | BDM (own), ASM+ (team, read) | |
| MTP — view/create | No | `GET/POST /api/mtp` | GET/POST | `MonthlyTourPlan` (new) | `MTP_SUBMIT` | BDM | |
| MTP — submit for approval | No | `PATCH /api/mtp/:id/submit` | PATCH | `MonthlyTourPlan` (new) | `MTP_SUBMIT` | BDM | `approverId` auto-set from `reportingManagerId`, not user-chosen |
| MTP — approve/reject/withdraw | No | `PATCH /api/mtp/:id/decision`, `PATCH /api/mtp/:id/withdraw` | PATCH | `MonthlyTourPlan` (new) | `MTP_APPROVE` | ASM+ (only the computed approver, or their own reporting chain for escalation view) | |
| Expenses — list/summary | No | `GET /api/expenses` | GET | `Expense` (new) | `EXPENSE_SUBMIT` | BDM (own), ASM+ (team) | |
| Expenses — add + receipt upload | No | `POST /api/expenses` | POST | `Expense` (new) | `EXPENSE_SUBMIT` | BDM | Reuses existing authorized-file-serve pattern for receipts |
| Expenses — approve/reject | No | `PATCH /api/expenses/:id/decision` | PATCH | `Expense` (new) | `EXPENSE_APPROVE` | ASM+ (computed approver only) | |
| Manager Field Call — log | No | `POST /api/manager-field-calls` | POST | `ManagerFieldCall` (new) | `FIELDCALL_LOG` | ASM, RSM, ZSM, NSM | Separate model per decision #6 |
| Manager Field Call — visibility | No | `GET /api/manager-field-calls` | GET | `ManagerFieldCall` (new) | `FIELDOPS_MONITOR` | reporting manager + Admin | |
| Work Type — daily log | No | `POST /api/work-type` | POST | `WorkType` (new) | `WORKTYPE_LOG` | BDM, ASM, RSM, ZSM | `sick`/`leave` selections call the **existing** Leave API server-side rather than storing leave data on `WorkType` |
| Stockist / Secondary Sales | No | `GET/POST /api/stockists`, `GET/POST /api/secondary-sales` | GET/POST | `Stockist`, `SecondarySale` (new) | `STOCKIST_MANAGE` | BDM (own), ASM+ (team) | Lower priority — build after core DCR/MTP/Expense flow per §36 dependency order |
| Manager/Admin/NSM monitoring dashboards | No | `GET /api/fieldops/dashboard`, `GET /api/fieldops/monitor/:tier` | GET | aggregates over above | `FIELDOPS_MONITOR` | ASM+, Admin, NSM | Server-side aggregation scoped to caller's reporting subtree; never a full-company scan for a non-admin caller |
| Admin reports (DCR/MTP/expense/doctor-coverage/secondary-sales) | Partial (Activity log exists) | `GET /api/fieldops/reports/*` | GET | aggregates | `FIELDOPS_MONITOR` | Admin, NSM | Paginated/date-filtered, never unbounded company-wide dumps |
| Admin user management by tier | Yes (User CRUD) | — (extend filter) | GET | `User` | existing `USER_*` | Admin, HR | Add `fieldForce.tier` to filter/list, no new endpoint needed |

---

## Permissions to add (`server/config/permissions.js`)

```
ATTENDANCE_PUNCH   — self punch in/out (additive; existing ATTENDANCE_MANAGE untouched)
DOCTOR_VIEW        — view own/assigned doctors
DOCTOR_MANAGE      — create/assign/import doctors for own subtree
DCR_SUBMIT         — log/submit own DCR
MTP_SUBMIT         — create/submit own MTP
MTP_APPROVE        — approve/reject MTP submitted to you
EXPENSE_SUBMIT     — submit own expenses
EXPENSE_APPROVE    — approve/reject expenses submitted to you
FIELDCALL_LOG      — log a manager field call
WORKTYPE_LOG       — log daily work type
STOCKIST_MANAGE    — manage stockist/secondary-sales data
FIELDOPS_MONITOR   — read-only cross-subtree monitoring/reporting
```

Grants: `admin`/`superadmin` → all of the above (consistent with their existing `['*']`/near-all pattern). `hr`/`employee` role stays as today; the **tier-based** field-force permissions above are checked via `fieldForce.tier` (a new small helper, e.g. `hasFieldTierAtLeast(user, 'ASM')`), separate from and additive to the existing `role`-based `requirePermission()` — this is the concrete mechanism implementing decision #2.

---

**No schema or code changes made yet.** This is the Milestone 2 deliverable. See [MOBILE_DATABASE_SAFETY.md](MOBILE_DATABASE_SAFETY.md) for the collection-by-collection safety plan before implementation starts.
