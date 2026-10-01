# Google Play Store Privacy Policy & Data Safety Compliance Guide

This document provides the exact URLs, configuration, and step-by-step instructions for passing Google Play Store review and automated security inspections for **MIRUS Field Force** (`com.umanexus.fieldforce`).

---

## 1. Public HTTPS Links for Google Play Console

Google Play policy requires a **live, non-geofenced, publicly accessible HTTPS link** that requires no authentication, returns HTTP 200 OK, and is not a PDF or doc file.

| Document | Active Public HTTPS URL | Local / Staging URL |
| :--- | :--- | :--- |
| **Privacy Policy** | `https://hrms-mirus.com/privacy-policy` | `http://localhost:5000/privacy-policy`<br>`http://localhost:5173/privacy-policy.html` |
| **Account & Data Deletion** | `https://hrms-mirus.com/account-deletion` | `http://localhost:5000/account-deletion`<br>`http://localhost:5173/account-deletion.html` |
| **Terms of Service** | `https://hrms-mirus.com/terms` | `http://localhost:5000/terms`<br>`http://localhost:5173/terms.html` |
| **JSON API Metadata** | `https://hrms-mirus.com/api/privacy-policy` | `http://localhost:5000/api/privacy-policy` |

> **Note on Custom Domains & Static Hosting:**
> The primary production company domain is **`https://hrms-mirus.com`**.
> You can also deploy `docs/index.html` to **GitHub Pages** (Settings > Pages > Source `/docs`) for zero-maintenance 99.99% uptime static hosting.

---

## 2. In-App Integration Summary

To ensure Google reviewers and automated test bots verify in-app accessibility, the policy is linked in all key user touchpoints:

1. **Before Authentication (Login Screen)**:
   - Clickable legal disclaimer: *"By logging in, you agree to our Terms of Service and Privacy Policy."*
   - Prominent quick-access pill: **"🔒 Privacy Policy & Data Safety"**.
   - Tapping opens the native in-app `PrivacyPolicyScreen` with an "Open Public Web Version" browser launcher.
2. **After Authentication (All Roles)**:
   - **BDM Role** (`mobile/src/screens/bdm/MoreScreen.js`): Grid item **"Privacy Policy"** + footer link for **"Data & Account Deletion"**.
   - **Manager Role** (`mobile/src/screens/manager/ManagerMoreScreen.js`): NavRow for **"Privacy Policy"** and **"Data & Account Deletion"**.
   - **Executive / Admin Role** (`mobile/src/screens/executive/ExecutiveMoreScreen.js`): NavRow for **"Privacy Policy"** and **"Data & Account Deletion"**.
3. **Deep Linking**:
   - `mirus://privacy-policy`
   - `https://mirus.app/privacy-policy`

---

## 3. Google Play Console: Data Safety Form Answers

To prevent the Google Play automated scanner from flagging mismatches between the code and your Play Console declarations, fill out the **Data Safety** section in Google Play Console with the following exact values:

### Data Collection & Security Overview
- **Does your app collect or share any of the required user data types?** &rarr; **Yes**
- **Is all of the user data collected by your app encrypted in transit?** &rarr; **Yes** (TLS 1.2 / TLS 1.3 / HTTPS)
- **Do you provide a way for users to request that their data be deleted?** &rarr; **Yes**
- **Add URL for deletion request**: `https://hrms-mirus.com/account-deletion`

---

### Data Types Breakdown

#### 1. Personal Info
- **Name:**
  - Collected? **Yes**
  - Shared? **No**
  - Ephemeral? **No**
  - Required or Optional? **Required**
  - Purposes: **App functionality**, **Account management**
- **Email address:**
  - Collected? **Yes**
  - Shared? **No**
  - Ephemeral? **No**
  - Required or Optional? **Required**
  - Purposes: **App functionality**, **Account management**
- **User IDs (Employee ID, Company Code):**
  - Collected? **Yes**
  - Shared? **No**
  - Ephemeral? **No**
  - Required or Optional? **Required**
  - Purposes: **App functionality**, **Account management**

#### 2. Financial Info
- **Other Financial Info (Expense Claims / Reimbursements):**
  - Collected? **Yes**
  - Shared? **No**
  - Required or Optional? **Optional / Role-dependent (field expenses)**
  - Purposes: **App functionality** (processing employee expense reimbursements)

#### 3. Photos and Videos / Files and Docs
- **Photos / Files:**
  - Collected? **Yes** (when user attaches expense receipts or doctor list CSVs)
  - Shared? **No**
  - Required or Optional? **Optional**
  - Purposes: **App functionality**

#### 4. Device or Other IDs
- **Device or other IDs (Firebase FCM push token, device identifier):**
  - Collected? **Yes**
  - Shared? **No** (used exclusively by Firebase Cloud Messaging for alerts)
  - Required or Optional? **Required**
  - Purposes: **App functionality**, **Push notifications**

#### 5. Attendance & Work Records
- Disclosed under **App functionality** as core workforce management operations (timestamped punch-in/out records for shift validation and payroll records).

---

## 4. Account Deletion Compliance (Google Play Mandate)

Google Play mandates that all apps with account login must provide:
1. An in-app mechanism for users to request account deletion.
2. A publicly accessible web URL for account and data deletion requests.

Both requirements are fulfilled:
- Web URL: `https://hrms-mirus.com/account-deletion`
- In-App: Accessible via More > Data & Account Deletion (or Privacy Policy > Section 6).
- Contact Desk: `privacy@umanexus.com`

---

## 5. Verification Checklist for App Inspectors

- [x] HTTPS URL returns `HTTP 200 OK`
- [x] Content-Type is `text/html; charset=utf-8` (no PDF download)
- [x] Identifies App Name: **MIRUS Field Force**
- [x] Identifies Package Name: `com.umanexus.fieldforce`
- [x] Identifies Legal Entity: **Mirus Med Sciences Pvt. Ltd.** / **UmaNexus**
- [x] Discloses collection of user credentials (email, employee ID, hashed password)
- [x] Discloses collection of attendance records (punch-in/out timestamps, hours worked)
- [x] Discloses collection of device IDs & push tokens (FCM)
- [x] Discloses collection of uploaded receipts & field call reports (DCR/MTP)
- [x] Explicitly confirms user data is NOT sold to third parties or advertisers
- [x] Details security practices (TLS encryption in transit, bcrypt password hashing, expo-secure-store hardware keystore)
- [x] Contains dedicated Account & Data Deletion section and active URL
- [x] In-app link exists on Login screen before authentication
- [x] In-app link exists in all post-login user roles (BDM, Manager, Executive)
- [x] Unit tests pass verifying headers and disclosure text (`server/tests/legal.test.js`)
