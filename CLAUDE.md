# CLAUDE.md — Enterprise MERN HRMS Agent Playbook

## Project Overview
An Enterprise Human Resource Management System (HRMS) handling Employee Lifecycle Management: Onboarding, Dynamic Offer Letter generation with native E-Signatures, Document Vault storage, and automated Pay Slip generation.

## Architecture & Tech Stack
- Frontend: React 19 (Vite), TailwindCSS, React Router v6, Redux Toolkit, React-Signature-Canvas
- Backend: Node.js, Express.js (REST API, MVC Pattern), Multer (File Uploads)
- Database: MongoDB (Mongoose ODM)
- Documents: PDF-lib / PDFKit for PDF generation, local storage for encrypted document uploads
- Workspace Layout: Monorepo split into `/client` and `/server`

## Domain Specific Entities & System State Machines
- **Salary Package Models:** Persisted structures containing dynamic formula fields (Basic, HRA, Deductions). Admin can create, read, update, and apply a `SalaryStructureTemplate` ID directly to an individual employee profile.
- **Financial Rule:** Store currency values in absolute paisa integers (e.g., ₹84,900.00 stored as 8490000) to prevent floating-point calculation drift.
- **Candidate Lifecycle:** `Draft` -> `Offer Sent` -> `Signed & Accepted` -> `Active Employee`.
- **Link Expiry Logic:** Temporary portal access tokens must feature a strict backend time check block. Default expiration is 72 hours (3 days) from execution timestamp, but values can be overwritten during step orchestration by Admin config hooks.


## Operational Workflow (Design -> Implementation)
When tasked with building a specific domain component:

### Step 1: Technical & UX Design Specification
- Stop and generate a precise markdown architectural spec before writing code.
- Define Database Schemas (Mongoose models, indexes, relationships).
- Map out the REST API Contracts (Endpoint URLs, HTTP Methods, Request/Response JSON payloads).

### Step 2: User Story & Task Mapping
- Break down the module into a checklist of distinct User Stories using standard Agile formatting: `As a [Role], I want to [Action], so that [Benefit]`.
- Map out precise technical validation requirements (Acceptance Criteria) for every user story.

### Step 3: End-to-End Implementation Rules
- Build incrementally: Server first (routes, models, controllers), verified by cURL/Postman, followed by Frontend UI integrations.
- Maintain data integrity with backend validation using `express-validator` prior to database mutations.

## Development & Test Commands
- Run Server Local Dev: `cd server && npm run dev`
- Run Client Local Dev: `cd client && npm run dev`
- Run Backend Tests: `cd server && npm test`
- Seed Database: `cd server && npm run db:seed`

## Coding Style & Quality Guardrails
- Document Storage: Store files in `server/uploads/documents/` using randomized UUIDs for filenames. Never expose raw file paths; serve documents via an authorized route `GET /api/documents/:id`.
- Math Operations: Use absolute cents/paisa integers for salary data to avoid floating-point errors (e.g., ₹50,000.50 stored as 5000050).
- Auth Guardrails: All state-changing endpoints require explicit JWT role verification middleware (`verifyToken`, `authorizeRoles(['admin', 'hr', 'employee'])`).
- Commit Strategy: Commit locally to git automatically after every single fully implemented and verified User Story.
