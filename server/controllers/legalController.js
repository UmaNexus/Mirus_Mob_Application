/**
 * Legal Controller — Serves public HTTPS Privacy Policy, Terms of Service,
 * and Account Deletion compliance endpoints required by Google Play Console.
 */

const COMPANY_NAME = 'Mirus Med Sciences Pvt. Ltd.';
const DEVELOPER_NAME = 'UmaNexus';
const APP_NAME = 'MIRUS Field Force';
const PACKAGE_NAME = 'com.umanexus.fieldforce';
const CONTACT_EMAIL = 'privacy@umanexus.com';
const SUPPORT_EMAIL = 'support@umanexus.com';
const LAST_UPDATED = 'October 1, 2026';

function basePageTemplate({ title, subtitle, content }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>${title} | ${APP_NAME}</title>
  <style>
    :root {
      --primary: #E89000;
      --primary-dark: #B36D00;
      --primary-soft: #FFF3E0;
      --ink: #1F2937;
      --muted: #4B5563;
      --light-muted: #6B7280;
      --surface: #F9FAFB;
      --card: #FFFFFF;
      --line: #E5E7EB;
      --success: #16A34A;
      --success-soft: #DCFCE7;
      --danger: #DC2626;
      --danger-soft: #FEE2E2;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.65;
      color: var(--ink);
      background-color: var(--surface);
      padding: 0;
      margin: 0;
    }
    header {
      background-color: #111827;
      color: #FFFFFF;
      padding: 2.5rem 1.5rem;
      border-bottom: 4px solid var(--primary);
    }
    .header-container {
      max-width: 860px;
      margin: 0 auto;
    }
    .badge {
      display: inline-block;
      background: var(--primary);
      color: #FFFFFF;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      margin-bottom: 0.75rem;
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 0.5rem;
    }
    .meta {
      color: #9CA3AF;
      font-size: 0.9rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      margin-top: 0.75rem;
    }
    main {
      max-width: 860px;
      margin: 2rem auto;
      padding: 0 1.5rem 4rem 1.5rem;
    }
    .card {
      background: var(--card);
      border-radius: 12px;
      border: 1px solid var(--line);
      padding: 2rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      margin-bottom: 2rem;
    }
    h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #111827;
      margin-top: 1.75rem;
      margin-bottom: 0.75rem;
      padding-bottom: 0.35rem;
      border-bottom: 2px solid var(--primary-soft);
    }
    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: #374151;
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }
    p {
      margin-bottom: 1rem;
      color: var(--muted);
      font-size: 1rem;
    }
    ul, ol {
      margin-left: 1.5rem;
      margin-bottom: 1.25rem;
      color: var(--muted);
    }
    li {
      margin-bottom: 0.5rem;
    }
    strong {
      color: var(--ink);
    }
    a {
      color: var(--primary-dark);
      text-decoration: underline;
    }
    a:hover {
      color: var(--primary);
    }
    .highlight-box {
      background-color: var(--primary-soft);
      border-left: 4px solid var(--primary);
      padding: 1rem 1.25rem;
      border-radius: 0 8px 8px 0;
      margin: 1.25rem 0;
    }
    .highlight-box p {
      margin: 0;
      color: #92400E;
      font-weight: 500;
    }
    .table-container {
      overflow-x: auto;
      margin: 1.5rem 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.95rem;
    }
    th, td {
      padding: 0.75rem 1rem;
      border: 1px solid var(--line);
    }
    th {
      background-color: #F3F4F6;
      font-weight: 700;
      color: #111827;
    }
    tr:nth-child(even) td {
      background-color: #F9FAFB;
    }
    .nav-links {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .btn {
      display: inline-block;
      background-color: var(--primary);
      color: #FFFFFF;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      padding: 0.65rem 1.25rem;
      border-radius: 6px;
      transition: background-color 0.15s;
    }
    .btn:hover {
      background-color: var(--primary-dark);
      color: #FFFFFF;
    }
    .btn-outline {
      background-color: transparent;
      border: 1px solid var(--line);
      color: var(--ink);
    }
    .btn-outline:hover {
      background-color: #F3F4F6;
      color: var(--ink);
    }
    footer {
      text-align: center;
      padding: 2rem 1.5rem;
      color: var(--light-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--line);
      background: #FFFFFF;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-container">
      <span class="badge">Google Play Developer Compliance</span>
      <h1>${title}</h1>
      <p style="color: #D1D5DB; font-size: 1.1rem; margin-top: 0.25rem;">${subtitle}</p>
      <div class="meta">
        <span><strong>Application:</strong> ${APP_NAME} (${PACKAGE_NAME})</span>
        <span><strong>Developer:</strong> ${DEVELOPER_NAME}</span>
        <span><strong>Entity:</strong> ${COMPANY_NAME}</span>
        <span><strong>Last Updated:</strong> ${LAST_UPDATED}</span>
      </div>
    </div>
  </header>
  <main>
    <div class="card">
      ${content}
    </div>
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.</p>
    <p style="margin-top: 0.5rem;">
      <a href="/privacy-policy">Privacy Policy</a> &bull;
      <a href="/terms">Terms of Service</a> &bull;
      <a href="/account-deletion">Account & Data Deletion</a>
    </p>
  </footer>
</body>
</html>`;
}

export function getPrivacyPolicyHtml(req, res) {
  const content = `
    <div class="highlight-box">
      <p><strong>Official Privacy Commitment:</strong> ${APP_NAME} is an enterprise workforce management solution developed by ${DEVELOPER_NAME} for authorized personnel of ${COMPANY_NAME}. We strictly respect your privacy and process user data solely to deliver workforce and field management services. We do NOT sell personal data or share it with third-party advertisers.</p>
    </div>

    <h2>1. Introduction & Overview</h2>
    <p>This Privacy Policy describes how <strong>${DEVELOPER_NAME}</strong> and <strong>${COMPANY_NAME}</strong> ("we", "us", or "our") collect, use, store, and protect personal and professional information through the <strong>${APP_NAME}</strong> mobile application (Package: <code>${PACKAGE_NAME}</code>) and related cloud services.</p>
    <p>By installing, accessing, or using ${APP_NAME}, you acknowledge that you have read and understood this Privacy Policy. If you do not agree with this policy, please do not access or use the application.</p>

    <h2>2. Information We Collect</h2>
    <p>To provide attendance management, field reporting, and operational workforce functions, ${APP_NAME} collects the following categories of information:</p>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Data Category</th>
            <th>Specific Data Points Collected</th>
            <th>Collection Purpose & Justification</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>User Credentials & Authentication</strong></td>
            <td>Company code, employee ID or email address, salted & hashed password, session tokens (JWT).</td>
            <td>Required for secure account authentication, role determination (BDM, Manager, Executive), and preventing unauthorized access.</td>
          </tr>
          <tr>
            <td><strong>Attendance & Punch Records</strong></td>
            <td>Real-time punch-in and punch-out timestamps (date, hour, minute), daily attendance status (Present, Absent, Half-Day, Leave, Holiday), worked hours, overtime logs.</td>
            <td>Core workforce management functionality: recording daily duty cycles, computing shift hours, calculating payroll attendance, and fulfilling statutory labor record-keeping requirements.</td>
          </tr>
          <tr>
            <td><strong>Field Force Operations & Call Reports (DCR / MTP)</strong></td>
            <td>Doctor visit logs, clinic/hospital names, meeting notes, sample distributions, stockist interactions, secondary sales figures, monthly tour plans.</td>
            <td>Enables field representatives (BDMs) and managers to log and coordinate business visits, sales verification, and travel schedules.</td>
          </tr>
          <tr>
            <td><strong>Expense Claims & Uploaded Receipts</strong></td>
            <td>Travel allowance claims, daily allowance claims, lodging expenses, receipt photos or PDF vouchers uploaded by the employee.</td>
            <td>Processing employee business reimbursements and expense audit approvals.</td>
          </tr>
          <tr>
            <td><strong>Device Information & Push Notification Tokens</strong></td>
            <td>Device model, operating system version, Firebase Cloud Messaging (FCM) / Expo push tokens.</td>
            <td>Delivering real-time operational notifications (leave approvals, tour plan approvals, managerial alerts) and ensuring device compatibility.</td>
          </tr>
          <tr>
            <td><strong>Territory & Location Context</strong></td>
            <td>Assigned sales territory, headquarter area, and visit locations entered as part of official tour plans.</td>
            <td>Associating field operations with authorized business territories. Background location is NOT continuously tracked without user initiation.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>3. How We Use Collected Information</h2>
    <p>We process collected data exclusively for enterprise operational purposes, including:</p>
    <ul>
      <li><strong>User Authentication:</strong> Verifying your identity, maintaining secure login sessions, and assigning role-based permissions.</li>
      <li><strong>Attendance Tracking:</strong> Recording accurate punch-in/out timestamps and computing worked hours for attendance rosters and payroll.</li>
      <li><strong>Operational Workflows:</strong> Submitting and approving daily call reports (DCR), monthly tour plans (MTP), and leave applications.</li>
      <li><strong>Expense Reimbursement:</strong> Verifying expense receipts submitted by field representatives.</li>
      <li><strong>Push Notifications:</strong> Delivering transactional alerts, schedule approvals, and company announcements.</li>
      <li><strong>App Security & Diagnostics:</strong> Monitoring server uptime, preventing unauthorized system intrusions, and troubleshooting software errors.</li>
    </ul>

    <h2>4. Data Sharing & Third-Party Services</h2>
    <p>We do <strong>NOT</strong> sell, rent, monetize, or lease your personal information to third parties. We do <strong>NOT</strong> use personal data for third-party advertising or cross-app tracking.</p>
    <p>Data is shared strictly with the following trusted service providers under confidentiality agreements:</p>
    <ul>
      <li><strong>Google Firebase Cloud Messaging (FCM):</strong> Used to deliver push notifications to your mobile device. FCM handles device tokens in accordance with the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>.</li>
      <li><strong>Cloud Infrastructure Providers:</strong> Encrypted backend databases and application servers hosted in secure, ISO/IEC 27001-certified data centers with restricted network access.</li>
      <li><strong>Your Employer (${COMPANY_NAME}):</strong> Authorized HR personnel, managers, and system administrators access attendance and operational records in accordance with enterprise employment policies.</li>
    </ul>

    <h2>5. Data Security & Storage</h2>
    <p>We employ industry-standard administrative, physical, and technical safeguards to protect your personal data:</p>
    <ul>
      <li><strong>Encryption in Transit:</strong> All data transmitted between the mobile application and our servers is encrypted using modern Transport Layer Security (TLS 1.2 / TLS 1.3 / HTTPS).</li>
      <li><strong>Cryptographic Password Hashing:</strong> User passwords are never stored in plaintext; they are hashed using one-way salted <code>bcrypt</code> algorithms.</li>
      <li><strong>Hardware-Backed Secure Storage:</strong> Authentication tokens on your mobile device are stored inside hardware-backed secure storage (iOS Keychain / Android Keystore via <code>expo-secure-store</code>).</li>
      <li><strong>Multi-Tenant Data Isolation:</strong> Strict database-level isolation guarantees that organizational records are completely segregated and accessible only to authorized tenant users.</li>
    </ul>

    <h2>6. Data Retention Policy</h2>
    <p>We retain personal information and attendance records for as long as your enterprise account remains active and for a reasonable period thereafter to comply with statutory labor laws, payroll audit requirements, tax compliance, and legal obligations. Once data is no longer necessary for these purposes, it is securely deleted or anonymized.</p>

    <h2>7. User Rights & Account / Data Deletion</h2>
    <p>In accordance with Google Play User Data policies and global privacy regulations, users have rights regarding their personal data:</p>
    <ul>
      <li><strong>Right to Access:</strong> You may view your profile, attendance history, leave balance, and submitted reports directly within the app.</li>
      <li><strong>Right to Rectification:</strong> You may request corrections to inaccurate personal or attendance data through your manager or HR administrator.</li>
      <li><strong>Right to Account and Data Deletion:</strong> You have the right to request deletion of your account and associated personal data.</li>
    </ul>
    <p>To submit an account or data deletion request:</p>
    <ol>
      <li>Visit our dedicated <a href="/account-deletion">Account & Data Deletion Request Page</a>.</li>
      <li>Or email our privacy desk at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with your Employee ID and Company Code.</li>
    </ol>
    <p>Upon verification of your request, our team will process the deletion of your account credentials and personal profile within 30 days, subject to statutory employment record retention requirements mandated by law.</p>

    <h2>8. Children's Privacy</h2>
    <p>${APP_NAME} is strictly an enterprise business-to-business (B2B) workplace tool intended for use by adult employees and authorized professionals (aged 18 and older). We do not knowingly solicit or collect information from children under 13 (or under 18). If we learn that personal data of a minor has been mistakenly collected, we will promptly delete it.</p>

    <h2>9. Permissions Required by the App</h2>
    <p>The app requests the following Android runtime permissions strictly for their stated business purposes:</p>
    <ul>
      <li><code>android.permission.INTERNET</code>: Enables communication with our secure HTTPS backend API.</li>
      <li><code>android.permission.VIBRATE</code>: Provides haptic feedback upon push notification delivery.</li>
      <li><code>android.permission.READ_EXTERNAL_STORAGE</code> (SDK &le; 32): Allows you to select and attach expense receipts and documents.</li>
      <li><code>Notifications Permission</code>: Allows the app to notify you when leave requests, MTPs, or reports are approved or require action.</li>
    </ul>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this Privacy Policy periodically to reflect enhancements to our features, service architecture, or regulatory compliance standards. Any updates will be published on this public URL with an updated "Last Updated" timestamp. We encourage users to review this page periodically.</p>

    <h2>11. Contact Us & Grievance Redressal</h2>
    <p>If you have any questions, concerns, or requests regarding this Privacy Policy or your data, please contact our designated Data Protection & Privacy Team:</p>
    <div style="margin-top: 1rem; line-height: 1.8;">
      <p><strong>Data Protection Officer / Privacy Officer:</strong></p>
      <p>Developer: <strong>${DEVELOPER_NAME}</strong></p>
      <p>Organization: <strong>${COMPANY_NAME}</strong></p>
      <p>Privacy Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
      <p>Support Email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    </div>

    <div class="nav-links" style="margin-top: 2rem;">
      <a href="/account-deletion" class="btn">Account Deletion Information</a>
      <a href="/terms" class="btn btn-outline">Terms of Service</a>
    </div>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(basePageTemplate({
    title: 'Privacy Policy',
    subtitle: `Public Privacy Disclosures for ${APP_NAME}`,
    content
  }));
}

export function getAccountDeletionHtml(req, res) {
  const content = `
    <div class="highlight-box">
      <p><strong>Google Play User Data Compliance:</strong> This page fulfills Google Play's Account Deletion mandate. Users of ${APP_NAME} can request permanent deletion of their account credentials and associated personal data.</p>
    </div>

    <h2>Account & Data Deletion Instructions</h2>
    <p>At <strong>${DEVELOPER_NAME}</strong> and <strong>${COMPANY_NAME}</strong>, we respect your right to control your personal data. If you wish to delete your account in <strong>${APP_NAME}</strong> and erase associated personal information, please review the steps and policy outlined below.</p>

    <h3>How to Request Account & Data Deletion</h3>
    <p>You can request account deletion through either of the following methods:</p>

    <div style="margin: 1.5rem 0; padding: 1.5rem; background: #F3F4F6; border-radius: 8px;">
      <h3 style="margin-top: 0; color: #111827;">Option 1: In-App Request</h3>
      <p>1. Open <strong>${APP_NAME}</strong> on your mobile device.<br>
         2. Navigate to the <strong>More</strong> tab (bottom navigation).<br>
         3. Tap <strong>Privacy & Data Safety</strong> &gt; <strong>Request Account Deletion</strong>.<br>
         4. Confirm your submission.</p>
    </div>

    <div style="margin: 1.5rem 0; padding: 1.5rem; background: #F3F4F6; border-radius: 8px;">
      <h3 style="margin-top: 0; color: #111827;">Option 2: Direct Web / Email Submission</h3>
      <p>Send an email to our Data Protection Team at <a href="mailto:${CONTACT_EMAIL}?subject=Account%20and%20Data%20Deletion%20Request%20-%20MIRUS%20Field%20Force">${CONTACT_EMAIL}</a> with:</p>
      <ul>
        <li>Subject: <code>Account and Data Deletion Request - MIRUS Field Force</code></li>
        <li>Your Full Name</li>
        <li>Registered Employee ID or Email Address</li>
        <li>Company Code / Tenant Identifier</li>
      </ul>
      <a href="mailto:${CONTACT_EMAIL}?subject=Account%20and%20Data%20Deletion%20Request%20-%20MIRUS%20Field%20Force" class="btn" style="margin-top: 0.5rem;">Send Deletion Email</a>
    </div>

    <h2>What Happens When You Request Deletion?</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Data Category</th>
            <th>Deletion Action</th>
            <th>Retention Period & Justification</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>User Credentials & Profile</strong></td>
            <td>Permanently Erased</td>
            <td>Login credentials, email, password hash, and active session tokens are wiped within 30 days of request confirmation.</td>
          </tr>
          <tr>
            <td><strong>Device & Push Tokens</strong></td>
            <td>Permanently Erased</td>
            <td>All FCM / Expo push notification device tokens are immediately unlinked and removed.</td>
          </tr>
          <tr>
            <td><strong>Attendance & Statutory Work Logs</strong></td>
            <td>Anonymized / Legally Retained</td>
            <td>Historical attendance and wage logs must be retained for the minimum statutory period required by labor, tax, and corporate governance legislation. After the legal retention period, records are purged or irreversibly anonymized.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Questions or Support?</h2>
    <p>If you have any questions regarding your deletion request, please reach out to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>

    <div class="nav-links" style="margin-top: 2rem;">
      <a href="/privacy-policy" class="btn">View Privacy Policy</a>
      <a href="/terms" class="btn btn-outline">Terms of Service</a>
    </div>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(basePageTemplate({
    title: 'Account & Data Deletion Request',
    subtitle: `User Data Deletion Policy for ${APP_NAME}`,
    content
  }));
}

export function getTermsHtml(req, res) {
  const content = `
    <h2>1. Acceptance of Terms</h2>
    <p>These Terms of Service ("Terms") govern your use of the <strong>${APP_NAME}</strong> application developed by <strong>${DEVELOPER_NAME}</strong> for <strong>${COMPANY_NAME}</strong>. By accessing or using the application, you agree to comply with and be bound by these Terms.</p>

    <h2>2. Authorized Business Use</h2>
    <p>${APP_NAME} is intended solely for authorized employees, contractors, and representatives of ${COMPANY_NAME}. Unauthorized access or use of this application is strictly prohibited.</p>

    <h2>3. User Account Responsibilities</h2>
    <p>You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You agree to notify your organization administrator immediately upon becoming aware of any unauthorized use of your credentials.</p>

    <h2>4. Accurate Attendance & Operational Reporting</h2>
    <p>You agree that all attendance punches, Daily Call Reports (DCR), Monthly Tour Plans (MTP), and expense reimbursement requests submitted through the app are truthful, accurate, and reflect actual business activities.</p>

    <h2>5. Termination</h2>
    <p>Your access to the application may be suspended or terminated upon cessation of your employment, contractor engagement, or breach of these Terms.</p>

    <h2>6. Contact Us</h2>
    <p>For questions regarding these Terms, contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>

    <div class="nav-links" style="margin-top: 2rem;">
      <a href="/privacy-policy" class="btn">Privacy Policy</a>
      <a href="/account-deletion" class="btn btn-outline">Account Deletion</a>
    </div>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(basePageTemplate({
    title: 'Terms of Service',
    subtitle: `Enterprise Usage Agreement for ${APP_NAME}`,
    content
  }));
}

export function getPrivacyPolicyJson(req, res) {
  return res.json({
    success: true,
    data: {
      appName: APP_NAME,
      packageName: PACKAGE_NAME,
      developer: DEVELOPER_NAME,
      company: COMPANY_NAME,
      lastUpdated: LAST_UPDATED,
      privacyPolicyUrl: '/privacy-policy',
      accountDeletionUrl: '/account-deletion',
      termsUrl: '/terms',
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
      collectedDataTypes: [
        { type: 'credentials', description: 'Company code, employee ID, email, hashed password, auth tokens' },
        { type: 'attendance', description: 'Punch-in/out timestamps, worked hours, leave and holiday status' },
        { type: 'fieldForce', description: 'Doctor visits, call reports, tour plans, stockist interactions' },
        { type: 'expenses', description: 'Claim amounts, travel allowances, uploaded receipt photos/documents' },
        { type: 'device', description: 'Device model, OS version, Firebase Cloud Messaging (FCM) push tokens' }
      ]
    }
  });
}
