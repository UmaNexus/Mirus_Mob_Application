# Google Play Console: App Access (Reviewer Credentials) Guide

This guide details how to configure **App Access** in the Google Play Console so Google reviewers can effortlessly log in and verify **MIRUS Field Force** (`com.umanexus.fieldforce`) with zero rejections.

---

## 1. Why Google Requires This

Google Play policy requires developers to provide functional test credentials for any app that has a login screen. Google reviewers will install the release build on a test device or automated emulator and attempt to log in.

If they encounter:
- Missing company slug / organization code instructions
- Empty states or broken data
- Two-factor authentication (OTP/SMS) walls
- Invalid credentials

...they will reject the app under **"Issue: Inoperable app / Unable to test"**.

---

## 2. Play Console: Step-by-Step Instructions

1. Log in to the [Google Play Console](https://play.google.com/console).
2. Select your app: **MIRUS Field Force**.
3. In the left navigation, scroll to **Policy and programs** &gt; **App content**.
4. Find **App access** and click **Start** (or **Manage**).
5. Select: **"All or some functionality is restricted"**.
6. Click **+ Add new instructions**.

---

## 3. Exact Values to Copy & Paste into Play Console

### Credential Set 1: Primary Field Force User (BDM) — *Recommended*

| Field Name | Value to Enter |
| :--- | :--- |
| **Credential / Instruction Name** | `Field Force Representative (BDM) - Primary Review Access` |
| **Username or email** | `reviewer.bdm@mirus.com` |
| **Password** | `Reviewer@2026!` |
| **Phone number** (if asked) | *Leave blank / Not applicable* |

#### Explanation / Instructions Box (Copy & paste verbatim):
```text
MIRUS Field Force is a multi-tenant pharmaceutical field workforce management app.
The login screen has 3 fields:

1. Company code: enter "mirus" (pre-filled by default)
2. Employee ID / Email: enter "reviewer.bdm@mirus.com"
3. Password: enter "Reviewer@2026!"

Alternatively, on the login screen, you may tap the quick-access pill:
"Field Rep (BDM)" located in the "Reviewer / Demo Quick Access" bar to instantly populate these credentials.

No OTP, 2FA, SMS, or biometric verification is required.

Once logged in, the reviewer can test all primary field force capabilities:
- Attendance: Self-service real-time Punch In / Punch Out on the Home screen
- Doctors: List of 6 pre-assigned healthcare professionals in Banjara Hills & Jubilee Hills
- MTP: Approved Monthly Tour Plan with planned territory schedules
- DCR: Daily Call Reports with product detailing and visit feedback
- More: Expenses (Travel/Food claims), Stockists, Secondary Sales, and Status Calendar
```

---

### Credential Set 2: Manager User (ASM) — *Optional Secondary Tier*

| Field Name | Value to Enter |
| :--- | :--- |
| **Credential / Instruction Name** | `Field Force Area Manager (ASM) - Approval Review Access` |
| **Username or email** | `reviewer.asm@mirus.com` |
| **Password** | `Reviewer@2026!` |

#### Explanation / Instructions Box:
```text
Enter:
1. Company code: "mirus"
2. Employee ID / Email: "reviewer.asm@mirus.com"
3. Password: "Reviewer@2026!"
Or tap "Manager (ASM)" in the quick-access bar.

This account demonstrates managerial hierarchy features: team attendance monitoring, DCR approval reviews, and doctor management.
```

---

## 4. In-App Quality-of-Life Implementation

We have added features to `LoginScreen.js` specifically designed to guarantee smooth review:

1. **Pre-filled Company Code:** The `Company code` field defaults to `mirus` automatically. If a reviewer leaves it untouched, it still logs in to `mirus`.
2. **Reviewer Quick-Access Bar:** Directly below the "Log In" button, there are two one-tap fill buttons:
   - `[Field Rep (BDM)]` &rarr; fills `mirus` + `reviewer.bdm@mirus.com` + `Reviewer@2026!`
   - `[Manager (ASM)]` &rarr; fills `mirus` + `reviewer.asm@mirus.com` + `Reviewer@2026!`
3. **No 2FA / Friction:** Reviewer accounts bypass any OTP requirements and go straight to the authenticated dashboard.

---

## 5. How to Seed Reviewer Accounts on Your Server

Whenever you set up your database or deploy to production, run:

```bash
cd server
npm run db:seed:reviewer
```

This script (`server/scripts/seed-reviewer-account.js`) is completely idempotent and will ensure the company `mirus`, the accounts `reviewer.bdm@mirus.com` and `reviewer.asm@mirus.com`, and all sample doctors, call reports, tour plans, and attendance history exist with 100% data integrity.
