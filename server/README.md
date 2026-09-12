# HRMS Server — Getting Started

Enterprise MERN HRMS backend (Express + MongoDB/Mongoose, ES Modules, MVC).
Covers the full employee lifecycle: authentication, user directory, offer
letters with e-signature, compensation modelling, payslips, onboarding, and a
secure document vault.

---

## 1. Prerequisites

- **Node.js ≥ 18** (uses the built-in test runner and `fetch`-era APIs)
- **MongoDB** running locally (`mongodb://127.0.0.1:27017`) or a connection string
- npm

## 2. Install

```bash
cd server
npm install
cd server
npm run db:setup -- --company-code=mirus --company-name="Mirus Med Sciences" \
  --admin-email=admin@mirus.com --admin-password='Admin@123'
```

## 3. Configure environment

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `5000` |
| `NODE_ENV` | `development` / `production` / `test` | `development` |
| `CLIENT_ORIGIN` | Frontend origin for CORS + magic-link URLs | `http://localhost:5173` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/hrms` |
| `JWT_SECRET` | **Required.** Secret for signing JWTs | — |
| `JWT_EXPIRES_IN` | Token lifetime | `1d` |
| `COOKIE_NAME` | Auth cookie name | `hrms_token` |
| `SEED_ADMIN_*` | Admin-only seed credentials | see file |

> In **production** the auth cookie is `Secure` (HTTPS only). In `development`
> tokens are also accepted via the `Authorization: Bearer <token>` header for
> easy testing with curl/Postman.

## 4. Seed / fresh setup

**Fresh install** (company code + admin — recommended):

```bash
npm run db:setup -- --company-code=mirus --company-name="Mirus Med Sciences" \
  --admin-email=admin@mirus.com --admin-password='Admin@123'
```

Run with no flags for an interactive prompt. Optional SMTP flags:
`--smtp-host`, `--smtp-port`, `--smtp-user`, `--smtp-pass`, `--mail-from`.

**Full demo dataset** (**destructive** — wipes HRMS collections):

```bash
npm run db:seed
```

This prints login credentials and live candidate offer links. Defaults:

| Role | Company code | Email | Password |
|---|---|---|---|
| Admin | `mirus` | `admin@mirus.com` | `Admin@123` |
| HR | `mirus` | `priya.hr@mirus.com` | `Password1` |
| Employee | `mirus` | `rahul.kumar@mirus.com` | `Password1` |

What gets created: 2 salary templates, admin + HR + 4 active employees (with
frozen salary assignments and May/June 2026 payslips), vault documents, and
2 offers (one `sent` with a live magic link, one `accepted` & signed).

> Need just an admin on an existing DB? `npm run db:seed:admin`.

Outbound email SMTP is stored on the **company** record and edited in
**Company Settings**. Configure it during `db:setup` or later in the admin UI.

## 5. Run

```bash
npm run dev     # nodemon, auto-reload
npm start       # plain node
```

Health check: `GET http://localhost:5000/api/health`.

## 6. Tests

Integration + unit tests use [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server)
(an ephemeral in-memory MongoDB — no external DB needed) and `supertest`.

```bash
npm test
```

Tests run **serially** (`--test-concurrency=1`) because each file spins up its
own in-memory MongoDB; the first run downloads the `mongod` binary.

---

## Project layout

```
server/
├── server.js               # entry: connect DB + listen
├── app.js                  # express app: middleware + route mounting
├── config/db.js            # mongoose connection
├── models/                 # User, SalaryStructureTemplate, EmployeeSalaryAssignment, OfferLetter, SalarySlip
├── middleware/             # auth, validate, error handler, file-upload guards
├── controllers/            # request handlers (MVC)
├── routes/                 # express routers per module
├── validators/             # express-validator rule sets
├── services/               # pdfService, emailService (stub), candidateService
├── utils/                  # jwt, money(paisa), numberToWords, salaryEngine, tokens, ApiError
├── seed/                   # seed.js (full) + seedAdmin.js
├── tests/                  # node:test suites + helpers
└── uploads/                # avatars (public), documents/payslips/offers (authorized only)
```

### Conventions

- **Money** is stored as **integer paisa** (₹50,000.50 → `5000050`) to avoid
  float drift. API money inputs (`annualCTC`) are accepted in **rupees** and
  converted on write.
- **Auth contract:** all state-changing endpoints sit behind `verifyToken` and
  `authorizeRoles([...])`.
- **File storage:** avatars are served statically; PAN/Aadhar documents and
  payslips/offers are **never** exposed by path — only via authorized streaming
  routes. Filenames are randomized UUIDs.
- **Errors** return `{ success: false, message, details? }`; success returns
  `{ success: true, ... }`.

---

## API reference

Base URL: `/api`. 🔒 = requires auth cookie/bearer; roles in brackets.

### Auth — Epic 1
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | Sets HTTP-only cookie. Generic 401 on bad creds. |
| POST | `/auth/logout` | public | Clears cookie. |
| GET | `/auth/me` | 🔒 any | Current user. |

### Profile — Epic 1
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/profile` | 🔒 any | Own profile. |
| PUT | `/profile` | 🔒 any | Update name/email/phone. |
| PATCH | `/profile/password` | 🔒 any | Change password. |
| POST | `/profile/avatar` | 🔒 any | Upload JPEG/PNG ≤ 2MB (field `avatar`). |
| DELETE | `/profile/avatar` | 🔒 any | Remove avatar. |

### Dashboard
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/dashboard/stats` | 🔒 admin/hr | Aggregate counters: totalEmployees, pendingOffers, slipsIssued (current month), pendingVerifications, acceptanceRate. |

### User Directory — Epic 2
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/users` | 🔒 admin/hr | Paginated. Query: `page,limit,search,role,status,department,includeDeleted`. |
| GET | `/users/:id` | 🔒 admin/hr | |
| PUT | `/users/:id` | 🔒 admin/hr | Edit whitelisted fields. |
| DELETE | `/users/:id` | 🔒 admin/hr | Soft-delete. |
| POST | `/users/:id/restore` | 🔒 admin/hr | Undo soft-delete. |

### Offer Letters — Epic 3
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/offers` | 🔒 admin/hr | Stage single offer (emails magic link). |
| POST | `/offers/bulk` | 🔒 admin/hr | Ingest `.xlsx` roster (field `roster`). |
| GET | `/offers` | 🔒 admin/hr | Paginated; `status`/`search` filters. |
| GET | `/offers/:id` | 🔒 admin/hr | |
| GET | `/offers/:id/pdf` | 🔒 admin/hr | Stream (signed) offer PDF. |
| PATCH | `/offers/:id/status` | 🔒 admin/hr | `sent\|pending\|accepted\|declined`. |
| POST | `/offers/:id/resend` | 🔒 admin/hr | Re-mint link + re-email. |

Bulk roster columns (header row 1): `fullName, email, position, department, annualCTC, joiningDate, templateName`.

### Compensation — Epic 4
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST/GET | `/salary-templates` | 🔒 admin/hr | Create / list templates. |
| GET/PUT/DELETE | `/salary-templates/:id` | 🔒 admin/hr | Get / update / deactivate. |
| POST | `/salary-assignments` | 🔒 admin/hr | `{userId,templateId,annualCTC}` → freezes breakdown. |
| GET | `/salary-assignments/user/:userId` | 🔒 admin/hr | |
| POST | `/payslips/generate` | 🔒 admin/hr | `{month,year,employeeIds?,notify?}`. |
| GET | `/payslips` | 🔒 admin/hr | Ledger view. |

`calculationType` options: `fixed` (paisa), `percentage_of_ctc`, `percentage_of_basic`, `balance_of_ctc` (remainder).

### Candidate (public, magic-link) — Epic 5
| Method | Path | Notes |
|---|---|---|
| GET | `/candidate/offer/:token` | View offer + compensation breakdown. |
| POST | `/candidate/offer/:token/sign` | `{signatureBase64}` → bakes PDF, accepts, emails setup link. |
| POST | `/candidate/setup-password` | `{token,password}` → activates account. |

### Onboarding — Epic 6
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/onboarding/status` | 🔒 any | Stage + section completeness + doc counts. |
| PATCH | `/onboarding/personal\|family\|contact\|bank` | 🔒 any | Wizard steps (advance stage). |

### Document Vault — Epic 6
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/documents` | 🔒 any | Upload PDF ≤ 5MB (field `document`) + `documentType,documentNumber`. |
| GET | `/documents` | 🔒 any | Own documents. |
| GET | `/documents/file/:fileId` | 🔒 owner/admin/hr | Authorized stream. |
| DELETE | `/documents/file/:fileId` | 🔒 owner | Delete (unless Verified). |
| GET | `/documents/user/:userId` | 🔒 admin/hr | A user's vault. |
| PATCH | `/documents/file/:fileId/verify` | 🔒 admin/hr | `{status: Pending\|Verified\|Rejected}`. |

### Employee Self-Service — Epic 7
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/self-service/overview` | 🔒 any | Profile hub card + latest payslip + doc counts. |
| GET | `/payslips/mine` | 🔒 any | Own payslip history (`?year=`). |
| GET | `/payslips/:id/pdf` | 🔒 owner/admin/hr | Download payslip PDF. |

---

## Quick smoke test (curl)

```bash
# Login (capture cookie)
curl -c jar.txt -X POST localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"companySlug":"mirus","email":"admin@mirus.com","password":"Admin@123"}'

# Use the session
curl -b jar.txt localhost:5000/api/users?limit=5
```

## Notes & assumptions

- **Email**: real SMTP sending via Nodemailer when `SMTP_USER` + `SMTP_PASS` are
  set in `.env`; otherwise it falls back to a console/in-memory stub. For Gmail,
  `SMTP_PASS` must be a 16-char **App Password** (Google Account → Security →
  2-Step Verification → App passwords), not your login password. In non-production
  the API also returns magic-link / setup tokens in responses for convenience.
- **Candidates** are backed by an inactive `User` (lifecycle "Draft") created at
  offer time with placeholder profile fields, completed during onboarding.
- `multer` is pinned to 2.x (1.x has open advisories).
