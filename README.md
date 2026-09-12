# mirus — Enterprise MERN Human Resource Management System

A **multi-tenant** full-stack HRMS covering the complete employee lifecycle:
authentication with **permission-based RBAC** (superadmin / admin / HR / employee),
a user directory with a section-wise **Employee 360** view, offer letters with
native e-signatures and an HR approval gate, compensation modelling with a
**statutory payroll engine** (PF/ESI/PT/TDS), automated payslips, multi-stage
onboarding (incl. education & previous experience), attendance & leave, holidays,
performance reviews / incentives / appraisals, a training video library, an asset
register, employee exit/offboarding with generated relieving & experience letters,
company-issued sealed documents (appointment letter / NDA / handbook / code of
conduct), uploadable documents with read-accept / write-fill-PDF modes (e.g.
Form 16), per-company branding & configuration, and a secure document vault.

Every company's data is isolated by a tenant `companyId` enforced centrally in
the data layer.

- **Frontend** (`/client`) — React 19 + Vite, Tailwind CSS + Material UI (hybrid), AG Grid, Redux Toolkit, React Router v6
- **Backend** (`/server`) — Node.js, Express (REST, MVC), MongoDB + Mongoose, JWT (HTTP-only cookie), Multer, pdf-lib, ExcelJS

```
hrms/
├── client/            # React SPA (admin + HR + employee portals)
├── server/            # Express REST API + MongoDB models
├── CLAUDE.md          # Engineering playbook / conventions
├── epics_backlogs.md  # Product epics & user stories
├── mongoose_models.md # Canonical DB schema reference
├── brainstrom.md      # Raw flow notes (admin + employee)
├── WIREFRAMES_ADMIN.md / WIREFRAMES_EMPLOYEE.md
└── README.md          # ← you are here
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 18 | Uses built-in test runner & modern ESM |
| **npm** | ≥ 9 | Ships with Node |
| **MongoDB** | ≥ 6 | Local (`mongodb://127.0.0.1:27017`) or a connection string (Atlas, etc.) |

> Tests use an in-memory MongoDB (`mongodb-memory-server`) and need no running DB.

---

## Quick start

Open **two terminals** — one for the server, one for the client.

### 1. Backend (`/server`)

#### Local Development

```bash
cd server
npm install
cp .env.example .env        # then set JWT_SECRET and MONGO_URI
npm run db:seed             # load demo data for every module (destructive)
npm run dev                 # http://localhost:5000
```

#### With Docker

```bash
# From project root
docker-compose up -d --build

# Seed database with initial data
docker-compose exec server npm run db:seed

# Or seed only admin user
docker-compose exec server npm run db:seed:admin

# Fresh setup (company code + admin email/password, optional SMTP)
docker-compose exec server npm run db:setup -- --company-code=mirus --company-name="Mirus Med Sciences" --admin-email=admin@mirus.com --admin-password='Admin@123'
```

`npm run db:seed` drops the database, loads a full demo company (`mirus` —
**Mirus Med Sciences**) across **every** module, and prints the credentials + a
live candidate offer link.

> **Multi-tenant login:** the app is multi-tenant, so sign-in requires a
> **Company code** (the tenant slug) in addition to email + password. The demo
> company's code is **`mirus`**; the platform superadmin uses **`_platform`**.

| Role | Company code | Email | Password |
|---|---|---|---|
| Admin | `mirus` | `admin@mirus.com` | `Admin@123` |
| HR | `mirus` | `priya.hr@mirus.com` | `Password1` |
| Employee | `mirus` | `rahul.kumar@mirus.com` | `Password1` |
| Superadmin (manages tenants) | `_platform` | `super@platform.local` | `ChangeMe!123` |

Additional seeded employees (company `mirus`, password `Password1`):
`amit.patel@mirus.com`, `neha.gupta@mirus.com`, `sunny.deol@mirus.com`.

> **`npm run db:setup`** is the recommended bootstrap for a fresh install — creates
> the platform superadmin + one company admin from CLI flags (or an interactive
> prompt). SMTP can be configured during setup or later under **Company Settings**.
>
> `npm run db:seed:admin` is a lighter non-interactive bootstrap (company code
> `mirus`, `admin@mirus.com` / `ChangeMe!123`) without the demo dataset.

### 2. Frontend (`/client`)

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to the backend on port 5000,
so no extra CORS/env config is needed for local development. Open
**http://localhost:5173** and sign in with a seeded account.

---

## Common commands

### Local Development

| Location | Command | What it does |
|---|---|---|
| `server` | `npm run dev` | Start API with auto-reload (nodemon) |
| `server` | `npm start` | Start API (plain node) |
| `server` | `npm run db:seed` | Load full demo dataset (wipes HRMS collections) |
| `server` | `npm run db:setup` | Fresh company + admin (CLI or interactive) |
| `server` | `npm run db:seed:admin` | Seed only an admin account |
| `server` | `npm test` | Run API + unit tests (in-memory Mongo, serial) |
| `client` | `npm run dev` | Start the SPA dev server |
| `client` | `npm run build` | Production build to `client/dist` |
| `client` | `npm run preview` | Preview the production build |

### Docker Commands

| Command | What it does |
|---|---|
| `docker-compose up -d --build` | Start all services (client, server, MongoDB) |
| `docker-compose down` | Stop all services |
| `docker-compose down -v` | Stop and remove all data volumes |
| `docker-compose exec server npm run db:seed` | Seed MongoDB with full demo dataset |
| `docker-compose exec server npm run db:seed:admin` | Seed only admin user |
| `docker-compose exec server npm test` | Run backend tests |
| `docker-compose logs -f server` | View server logs |
| `docker-compose logs -f client` | View client logs |
| `docker-compose logs -f mongodb` | View MongoDB logs |

**Quick Reference**: Use `./docker-commands.sh [command]` for common operations. Run `./docker-commands.sh` for full list.

---

## Environment variables (`server/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | Secret used to sign JWTs |
| `MONGO_URI` | ✅ | `mongodb://127.0.0.1:27017/hrms` | MongoDB connection string |
| `PORT` |  | `5000` | API port |
| `NODE_ENV` |  | `development` | `development` / `production` / `test` |
| `CLIENT_ORIGIN` |  | `http://localhost:5173` | CORS origin + magic-link base URL |
| `JWT_EXPIRES_IN` |  | `1d` | Token lifetime |
| `COOKIE_NAME` |  | `hrms_token` | Auth cookie name |

> **SMTP:** outbound mail credentials live on each company document and are
> edited in **Company Settings** (admin). Optional `SMTP_*` / `MAIL_FROM` env
> vars are only used to pre-fill company mail when seeding/setup runs.

See [`server/README.md`](server/README.md) for the full API reference and architecture notes.

---

## Portals at a glance

- **Superadmin** (platform) — provision and manage companies (tenants).
- **Admin / HR** — dashboard, user directory + **Employee 360** detail view,
  offer letters (single + bulk XLSX, e-sign + approval), salary templates &
  statutory payroll, document verifications, **attendance & leave** approvals +
  holidays, **performance** (reviews/incentives/appraisals/training), **training
  library** uploads, **asset register**, **exits/offboarding**, a **documents
  center** (issue sealed docs + manage uploadable types), and **company settings**
  (branding, statutory numbers, stamp & signature — admin only).
  RBAC: HR does day-to-day work but cannot delete users, change roles, or edit
  company config.
- **Candidate** (public magic link) — review offer + compensation breakdown,
  draw a signature to accept; after HR approval, login credentials are emailed.
- **Employee** — self-service hub, onboarding wizard, document vault, payslips,
  **attendance & leave**, **my documents** (acknowledge/sign/fill), **training**
  (watch videos + mark complete), **performance**, and **my assets**.

## Notes

- Money is stored as **integer paisa** to avoid floating-point drift.
- Avatars are served statically; PAN/Aadhar documents, payslips and offer PDFs are
  streamed only through authorized routes (never by raw path).
- Email is a console/in-memory stub (`server/services/emailService.js`) unless
  `SMTP_USER`/`SMTP_PASS` are set; in non-production, magic-link tokens and the
  temporary password (issued after an HR approves a signed offer) are returned in
  API responses for testing.
- Multi-tenancy is enforced by a Mongoose `tenantScope` plugin + an
  `AsyncLocalStorage` request context; run `node scripts/migrate-to-multitenant.js`
  to backfill any pre-tenant data into a default company.
