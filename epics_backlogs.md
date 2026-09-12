# HRMS Product Feature Epics & User Story Backlog

## --- ADMIN & HR EPICS ---

### Epic 1: Admin Authentication & Core Profile Management
- **User Story 1.1 (Secure Login):** As an Admin, I want to authenticate via an email and password secure portal so that I can access the management dashboard safely.
  - *Acceptance Criteria:* Enforce JWT issuance inside an HTTP-only cookie. Invalid credentials return a generic `401 Unauthorized` status.
- **User Story 1.2 (Workspace Layout & Navigation):** As an Admin, I want a persistent sidebar containing user profile info, User Management, Offer Letter Management, and Pay Slips so that I can hop across administrative sub-modules quickly.
- **User Story 1.3 (Avatar & Profile CRUD):** As an Admin, I want to update my biographical details and upload/delete an avatar image file so that my company records stay current.
  - *Acceptance Criteria:* Avatar upload handles file stream validation (`image/jpeg`, `image/png`, Max 2MB) using local disk storage middleware.

### Epic 2: User Profile Management & Directory Filtering
- **User Story 2.1 (Admin Dashboard Directory View):** As an Admin, I want to view a paginated table restricted to the 10 most recently modified users so that I always see the latest company activity at a glance.
- **User Story 2.2 (Multi-Parametric Filter Querying):** As an Admin, I want a single text filtering search row on top of the user matrix to query fields by Name, Type, Role, and Activation State instantly.
  - *Acceptance Criteria:* Implement compound backend database indexes on tracking strings to keep index queries running under 50ms.
- **User Story 2.3 (User Profile Data Mutation):** As an Admin, I want to select a data row to edit or safely soft-delete a system profile record so that our organizational data remains accurate.

### Epic 3: Offer Letter Generation Pipeline & Mass Ingestion
- **User Story 3.1 (Single System Offer Creation):** As an Admin, I want to complete an interface form tracking name, target position, compensation model, and offer date to stage an electronic offer document.
- **User Story 3.2 (Bulk Excel Worksheet Parser):** As an Admin, I want to select and ingest a structured `.xlsx` spreadsheet roster so that the backend can parse rows in parallel, create candidates, and fire off bulk transactional mail offers automatically.
  - *Acceptance Criteria:* Use an Excel parsing engine to catch malformed columns before executing database mutations. Throw descriptive array index errors for failed rows.
- **User Story 3.3 (Offer Document Manipulation & State Controls):** As an Admin, I want to track candidate progress state changes (`Sent` ➡️ `Pending` ➡️ `Accepted` ➡️ `Declined`), review PDF outputs, and trigger manual secure email reminders.

### Epic 3: Offer Letter Generation Pipeline & Mass Ingestion extended version
- **User Story 3.1 (Single System Offer Creation with Custom Rules):** As an Admin, I want to complete an interface form tracking name, position, salary structure, and customized verification criteria (e.g., custom token expiry windows up to 3 days, background validation requirements) to securely stage an electronic document.
- **User Story 3.2 (Bulk Excel Worksheet Parser):** As an Admin, I want to select and ingest a structured `.xlsx` spreadsheet roster so that the backend can parse rows in parallel, create candidates, and fire off bulk transactional mail offers automatically.
- **User Story 3.3 (Secure Magic Link Dispatch & Expiry Lifecycles):** As an Admin, I want to trigger a manual secure transactional email dispatch that calculates an encrypted secure hash link expiring strictly in 3 days (72 hours) or an admin-configured threshold, so that expired candidates are barred from accessing or signatures.
  - *Acceptance Criteria:* The transactional mail sends a route containing an appended cryptographic token validation parameter (e.g., `/portal/offer/accept?token=xyz`). The server enforces a hard-stop expiration interceptor check, returning an explicit `410 Gone: Link Expired` payload if accessed after 72 hours.


### Epic 4: Compensation Modeling & Automated Salary Slips
- **User Story 4.1 (Global Package Model Management):** As an Admin, I want to configure and persist a specific reusable salary calculation template so that I can quickly assign uniform calculation metrics to new hires.
- **User Story 4.2 (Bulk Selection Pay Slip Issuance):** As an Admin, I want to search and filter employees using table checkboxes to batch-execute monthly salary processing slips.
- **User Story 4.3 (Financial Payload Data Ingestion):** As an Admin, I want the system to generate a standardized document layout detailing granular line items (Basic Pay, HRA, Transport, PF, PT, TDS) and convert the Net Take-Home value into words cleanly.

---

## --- EMPLOYEE EPICS ---

### Epic 5: Candidate Access & E-Sign Offer Acceptance
- **User Story 5.1 (Secure Magic Link Access):** As a Candidate receiving an email offer, I want to click a temporary authentication token link so that I can securely view my offer dashboard without creating a password first.
- **User Story 5.2 (Interactive Compensation Breakdown Inspection):** As a Candidate, I want to view a visual breakdown of my annual CTC showing monthly Basic, HRA, Gross, and Net Take-Home earnings so that I clearly understand my package terms before signing.
- **User Story 5.3 (DocuSign-Style Drawing Signature Portal):** As a Candidate, I want to draw my cursive signature using an HTML5 responsive touch canvas and click "Accept Offer" so that I can legally lock and submit my dynamic employment execution contract.
  - *Acceptance Criteria:* Canvas conversion outputs a valid Base64 asset. The backend bakes this string onto the target template coordinate layout using `pdf-lib` and updates the offer status flag to `accepted`.
- **User Story 5.4 (Automated System Identity Transition):** As an Accepted Candidate, I want the system to instantly generate my official Company Password Setup Portal link via email so that I can register my corporate employee account access credentials.

### Epic 6: Employee Onboarding Data & Document Vault Collection
- **User Story 6.1 (Interactive Step-by-Step Onboarding Form):** As a Newly Joined Employee, I want a multi-stage profile creation wizard to input my Personal Details, Family Members, Contact info, and Bank Account metrics.
- **User Story 6.2 (Document Verification Asset Dropzone):** As an Employee, I want a secure drag-and-drop file upload engine to submit PDF files of my PAN, Aadhar, and academic credentials for HR review.
  - *Acceptance Criteria:* Upload processing enforces strict file validation (`application/pdf`, max 5MB) and renames file locations with randomized UUID strings to safeguard system directories.
- **User Story 6.3 (Onboarding Status Progress Tracking):** As an Employee, I want a simple progress tracking indicator on my dashboard so that I know if my documents are `Pending`, `Verified`, or require a `Resubmission`.

### Epic 7: Employee Self-Service Dashboard & Financial Ledgers
- **User Story 7.1 (Employee Profile Hub Overview):** As an Employee, I want to view a clean landing page tracking my current corporate avatar picture, formal designation, system registration code, and reporting team line items.
- **User Story 7.2 (Historical Pay Slip Matrix Navigation):** As an Employee, I want a chronological data table displaying all my distributed historical payment slips showing Month, Year, and Net Take-Home numbers.
- **User Story 7.3 (On-Demand Pay Slip PDF Rendering):** As an Employee, I want to click an item in my payslip table to instantly stream and download a beautifully formatted, print-ready corporate pay ledger PDF.
