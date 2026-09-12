# HRMS — End-to-End Feature Gap Analysis & Epic Plan

Compares the **current build** against the client's full employee-lifecycle
requirement. Legend: ✅ Built · 🟡 Partial · ❌ Missing.

> UI principle for all new work: **keep it simple** — one clean form/table per
> screen, minimal steps, reuse the existing wizard + DataGrid + Card components.

### Confirmed scope decisions (client)
1. **Corporate-only** — pharma field-force vertical is **out of scope** (Epic 15 dropped).
2. **Multi-tenant SaaS** — **many companies share one deployment** with fully
   isolated data. Every tenant-scoped record carries a `companyId`; branding,
   letterhead, statutory numbers, stamp and signatory signature are per-company
   configuration. This is a **cross-cutting foundation (Epic T)** that must land
   before all other new work.
3. **Statutory documents are system-generated** (appointment letter, NDA, handbook,
   code of conduct). Inputs = **date + designation** plus required fields collected
   from the user/HR. A **pre-saved company stamp + authorized-signatory signature**
   image is **printed onto every company-issued PDF**.
4. **Payroll = calculation *and* record-keeping** — a real statutory engine
   (PF, ESI, Professional Tax, TDS) plus the existing payslip records.
5. **Separate Admin & HR with proper RBAC** — today both roles are treated
   identically (`['admin','hr']`). Split into distinct roles with granular,
   permission-based access (Epic R).

---

## 1. What already exists (baseline)

| Area | Status | Where |
|------|--------|-------|
| Auth (JWT, roles admin/hr/employee) | ✅ | `authRoutes`, `authSlice` |
| Employee master register + directory/search/soft-delete | ✅ | `User.js`, `UsersPage` |
| Personal / contact / family / bank details | ✅ | `User.js`, onboarding wizard |
| Document vault + verification workflow (Pending/Verified/Rejected) | ✅ | `uploadedDocuments`, `VerificationsPage` |
| Offer letter pipeline (create, bulk XLSX, magic link, e-sign, **HR approval gate**, provisioning) | ✅ | `offerController`, `candidateController` |
| Salary structure templates + per-employee frozen breakdown | ✅ | `SalaryStructureTemplate`, `EmployeeSalaryAssignment` |
| Monthly payslip generation + PDF + email | ✅ | `SalarySlip`, `payslipController` |
| Employee self-service (profile hub, my offer, my payslips, my team) | ✅ | `features/employee` |

---

## 2. Requirement-by-requirement gap map

### 1. Personal Details — 🟡 (near complete)
- ✅ Full name, DOB, gender, mobile, email, present/permanent address, emergency contact, family members (father/mother/spouse via `familyDetails`).
- 🟡 **Passport-size photograph** — an avatar (`profilePictureUrl`) exists, but not a formal passport-photo document slot.

### 2. Identity & Address Proof — 🟡
- ✅ Aadhaar, PAN, Voter ID, Passport (doc types + verification).
- ❌ **Driving Licence** not in the `documentType` enum.

### 3. Educational Qualifications — 🟡 (weak)
- 🟡 Generic `DegreeCertificate` / `EducationCertificate` upload only.
- ❌ No **structured education history** (SSC/10th, 12th, Degree/PG, professional certs with institution, year, marks/grade). No education step in onboarding.

### 4. Employment Details — 🟡
- ✅ Employee ID, designation, department, date of joining, reporting manager.
- 🟡 Employment type enum is `Full-Time/Part-Time/Contract/Intern` — client wants **Permanent/Probation/Contract**.
- ❌ **Work location** field missing.

### 5. Previous Experience — ❌ (module missing)
- Docs (relieving letter, payslip) can be uploaded, but there is **no structured previous-employer history, experience certificates linkage, or references** entity.

### 6. Salary & Payroll — 🟡
- ✅ CTC/structure, bank account, IFSC, PF/UAN.
- ❌ **UPI ID**, **ESI number**, **Professional Tax registration** fields missing on profile (PT appears only as a payslip line item).

### 7. Statutory Documents — 🟡 (only offer letter)
- ✅ Offer letter (full e-sign pipeline).
- ❌ **Appointment letter** generation, **NDA/Confidentiality**, **Employee handbook acknowledgment**, **Code of conduct acceptance** — no generation or e-sign/acknowledge flow.

### 8. Attendance & Leave — ❌ (entire module missing)
- No attendance capture, leave applications/approval, holiday calendar, or overtime.

### 9. Performance Records — ❌ (entire module missing)
- No KPI/target sheets, monthly reviews, incentive calc, appraisal/promotion, training records.

### 10. Exit Records — ❌ (entire module missing)
- No resignation, exit interview, full & final settlement, asset-return checklist, or system-generated experience/relieving letters.

### Pharma Marketing add-on — ❌ (entire specialized module missing)
- Territory/HQ, assigned doctor list, Daily Call Report (DCR), Tour Program (TP), expense claims, sample issue/return register, monthly sales targets vs achievement, distributor/stockist master, product training records.

### Company-wide operational registers
- ✅ Employee master register, ✅ per-employee digital document folders, ✅ payroll records.
- ❌ Attendance records, ❌ sales performance tracker, ❌ incentive tracker, ❌ **asset register** (laptop, mobile, promotional materials).

---

## 3. Proposed epics (prioritised)

Ordering favors highest client value + reuse of existing patterns first.

### Foundational — cross-cutting, build before everything else
**Epic T: Multi-Tenancy Foundation** *(new, do FIRST — touches every model & query)*
- Root `Company` (tenant) model; add `companyId` (indexed, ref `Company`) to **every**
  tenant-scoped model: `User`, `OfferLetter`, `EmployeeSalaryAssignment`,
  `SalaryStructureTemplate`, `SalarySlip`, and all new models.
- **Data isolation (security-critical):** a Mongoose plugin / query helper that
  auto-scopes every read & write to the caller's `companyId`; a cross-tenant access
  must be impossible even on a mistyped query. Cover with tests.
- **Auth changes:** JWT carries `companyId`; email uniqueness moves from global to
  **`{ companyId, email }`** compound unique index; login resolves the tenant.
- **Roles:** add a platform **`superadmin`** (manages tenants) above company `admin`.
- **Tenant onboarding:** signup/provisioning flow that creates a Company + its first
  admin; per-tenant DB **seed**.
- **File storage:** namespace uploads by `companyId` (`uploads/<companyId>/…`).
- **Candidate/magic-link flows** resolve tenant from the offer record.
- *Risk:* cross-tenant data leakage is the #1 hazard — centralize scoping, don't
  rely on per-controller filters.

**Epic R: Admin/HR Role Separation & RBAC** *(after Epic T; touches every route guard)*
- Today `admin` and `hr` are interchangeable (`authorizeRoles(['admin','hr'])`). Introduce
  **granular permissions** instead of role-name checks:
  - Define a permission catalog (e.g. `user:delete`, `user:role:change`, `offer:approve`,
    `payroll:run`, `template:manage`, `document:verify`, `tenant:manage`).
  - Map roles → permissions: **admin** = full company scope; **hr** = day-to-day HR
    (create/edit users, offers, documents, payroll run) **minus** sensitive ops
    (change roles, delete users, manage company config) — final matrix to confirm with client.
  - Replace `authorizeRoles([...])` with a `requirePermission('...')` middleware backed by
    the role→permission map; keep `superadmin` above all.
- *UI:* hide/disable actions the caller lacks; show a permissions summary.
- *AC:* an HR user is blocked (403) from admin-only actions; an admin is not; covered by tests.

**Epic C: Company Configuration & Branding** *(after Epic T; per-tenant settings)*
- Singleton `Company` model: legal name, address, logo, **letterhead**, statutory
  registration numbers (**PF, ESI, PT, TAN, GST/CIN**), and authorized signatory name.
- **Asset uploads:** company **stamp** image + **authorized-signatory signature** image,
  stored like other documents (UUID filenames, served via authorized route).
- `pdfService` reads these and **stamps every generated PDF** (offer, appointment
  letter, NDA, payslip) with logo + stamp + signature — removes all hardcoded "XYZ".
- Email `from`/branding pulled from `Company` instead of env constants.
- *UI:* one **Company Settings** page (admin only) — form + two image dropzones.
- *Unblocks:* Epic 10 (doc generation) and Epic 16 (payroll statutory numbers).

### Quick wins — extend existing models (low effort, high coverage)
**Epic 8: Profile & Document Completeness**
- Add `DrivingLicence` + `PassportPhoto` to `documentType` enum (server + client `DOCUMENT_TYPES`).
- Add profile fields: `employeeDetails.workLocation`, `bankDetails.upiId`, `employeeDetails.esiNumber`, `employeeDetails.ptNumber`.
- Change employment-type enum to include `Permanent`, `Probation`.
- *Stories:* extend `EditUserDialog`, onboarding **bank** step, and document dropzone. No new screens.

**Epic 9: Structured Education & Previous Experience**
- New sub-docs on `User`: `educationHistory[]` (level, institution, board/university, year, grade) and `experienceHistory[]` (employer, designation, from/to, lastCTC, relieving-doc ref, reference contact).
- *Stories:* two new **onboarding wizard steps** ("Education", "Experience") — reuse existing repeatable-row pattern from `familyDetails`. HR views them on the profile.

### Core HR modules (new, larger)
**Epic 10: Statutory Document Kit (system-generated + e-acknowledge)**
- Reusable document engine that **generates** the PDF from a template + inputs:
  Appointment Letter, NDA, Employee Handbook, Code of Conduct.
- **Inputs:** effective **date** + **designation** (+ per-doc required fields), most
  pre-filled from the employee's profile/offer; HR confirms/edits before issue.
- Each generated PDF is **stamped with the company stamp + authorized-signatory
  signature** from **Epic C** (that is the "company-issued" seal).
- Model: `EmployeeDocument { userId, type, inputs, pdfUrl, status(issued/acknowledged),
  acknowledgedAt, employeeSignature }`.
- *Flow:* HR issues → employee sees "Documents to Sign" → reviews the sealed PDF →
  acknowledges (checkbox) or **counter-signs** via `SignaturePad`.
- *UI:* HR "Issue Document" action; employee "My Documents to Sign" list. Reuses the
  offer e-sign + PDF-baking code.

**Epic 11: Attendance & Leave Management**
- Models: `Attendance { userId, date, checkIn, checkOut, status }`, `LeaveRequest { userId, type, from, to, status, approverId }`, `Holiday { date, name }`.
- *UI:* employee — mark attendance + apply leave (simple form + status chips); HR — approval queue (DataGrid) + holiday calendar. Overtime as an attendance flag.

**Epic 12: Performance & Training**
- Models: `PerformanceReview { userId, period, kpis[], rating, reviewerId }`, `IncentiveRecord`, `TrainingRecord`, `AppraisalRecord`.
- *UI:* employee sees own reviews/training; HR creates review cycles. Keep to table + form.

**Epic 13: Asset Register**
- Model: `Asset { tag, type(laptop/mobile/promo), assignedTo, issuedAt, returnedAt, condition }`.
- *UI:* HR asset table with assign/return; feeds the exit checklist.

**Epic 14: Employee Exit / Offboarding**
- Model: `ExitRecord { userId, resignationDate, lastWorkingDay, exitInterview, assetReturn[], fnfSettlement, generatedDocs }`.
- Auto-generate experience & relieving letters (reuse PDF service). Asset-return checklist pulls from Epic 13.
- *UI:* a single guided offboarding checklist screen.

**Epic 16: Statutory Payroll Calculation Engine**
- Extend the current template/breakdown engine into a **full monthly run** that
  computes statutory components, not just splits CTC:
  - **PF** (employee 12% of basic, employer share, capped), **ESI** (rate + wage
    ceiling eligibility), **Professional Tax** (state slab table), **TDS** (income-tax
    slabs / declarations), plus LOP based on Epic 11 attendance.
- Uses the company PF/ESI/PT numbers from **Epic C** on payslips and registers.
- Keeps existing payslip records + adds **statutory registers/reports** (PF/ESI/PT
  monthly summaries) for compliance/filing.
- *UI:* extend the existing payslip batch screen with a "statutory summary" view.

**Epic 17: Uploadable Document Types + Read/Write Access (per-employee)**
- For documents that are **uploaded, not generated** — **Form 16**, insurance cards,
  bonus letters, policy PDFs, any company PDF — let HR define a reusable **document type**
  without code:
  - a **section** (category/grouping, e.g. "Tax", "Payroll", "Compliance", "Policies"),
  - a set of **custom input fields** (label; type text/number/date/dropdown; required?).
- **Access mode chosen at upload/assign time** — the key new behavior:
  - **`read`** → the employee opens the PDF and must **accept the terms & conditions**
    ("I have read and agree") — the system records a **read-confirmation**
    (`acknowledgedAt`, accepted checkbox, IP/timestamp). No editing.
  - **`write`** → the employee **enters values directly into the PDF** using an in-app
    **PDF editor**; on submit the filled values are saved and a **flattened filled PDF**
    is stored against that user.
- **PDF editor choice:** render + fill AcroForm fields — pragmatic open path is
  **PDF.js** (render) + capture field values → **`pdf-lib`** fills & flattens server-side;
  or drop in any editor component (react-pdf, PSPDFKit/Apryse) behind the same save API.
- Models (tenant-scoped):
  - `DocumentType { companyId, name, section, kind:'read'|'write', fields[], termsText? }` — reusable definition.
  - `EmployeeDocumentRecord { companyId, userId, documentTypeId, accessMode:'read'|'write',
    sourceFileUrl, filledFileUrl?, fieldValues{}, status:'pending'|'acknowledged'|'submitted',
    acknowledgedAt?, ipAddress?, uploadedBy, uploadedAt }`.
- *UI:* HR "Document Types" config (section + fields + read/write + T&C text) and an
  "assign/upload to employee(s)" action; employee "My Documents" list grouped **by section**
  — read docs show an **Agree & Confirm** button, write docs open the **PDF editor**.
- *Note:* complements **Epic 10** (generated + sealed). Epic 10 = system-generated;
  Epic 17 = uploaded, with read-acknowledge or write-fill.

**Epic 18: Training Media Library (videos by section)**
- HR **uploads training videos** organized into **different sections/courses**
  (e.g. "Onboarding", "Compliance", "Product"). Employees browse by section and watch.
- Models (tenant-scoped):
  - `TrainingSection { companyId, title, order }`
  - `TrainingMedia { companyId, sectionId, title, videoUrl, description, durationSec }`
  - `TrainingProgress { companyId, userId, mediaId, status:'assigned'|'in-progress'|'completed', completedAt }`
- **Storage:** large video files — stream via an authorized route with HTTP range support
  (or object storage/CDN later); do **not** serve from the public static dir.
- *UI:* HR upload + section manager; employee "Training" page — cards grouped by section,
  a simple video player, and a **Mark complete** action feeding training records (Epic 12).

### Dropped
**Epic 15: Pharma Field-Force** — **out of scope** (corporate-only confirmed).

---

## 4. Suggested build order
1. **Epic T** (multi-tenancy foundation) — **do FIRST**; refactors all existing models/queries/auth. ✅ *implemented*
2. **Epic R** (Admin/HR RBAC split) — small, touches route guards; do early while auth is fresh.
3. **Epic C** (per-company config + stamp/signature) — unblocks docs & payroll.
4. **Epic 8** (field/enum extensions) — days.
5. **Epic 9** (education + experience wizard steps).
6. **Epic 10** (statutory doc kit — generated + sealed, reuses e-sign).
7. **Epic 11** (attendance & leave — manual; also feeds payroll LOP).
8. **Epic 16** (statutory payroll calculation — depends on Epic C + 11).
9. **Epic 17** (uploadable doc types + read/write access — Form 16 etc.; can slot in early after Epic T).
10. **Epic 18** (training media library — videos by section; pairs with Epic 12 training records).
11. **Epic 12–14** (performance, assets, exit).

## 5. Resolved scope (was: open questions)
- ✅ Pharma vertical **out of scope** — corporate-only, must work for **any company**.
- ✅ Attendance is **manual self-mark** (biometric/geo deferred).
- ✅ Statutory docs are **system-generated** with date + designation inputs and a
  **company stamp + signatory signature baked into the PDF**.
- ✅ Payroll = **calculation + record-keeping** (PF/ESI/PT/TDS engine).

- ✅ **Multi-tenant SaaS** confirmed — many companies, one deployment, isolated data
  (Epic T). This is the largest single change and reshapes auth + every model.
