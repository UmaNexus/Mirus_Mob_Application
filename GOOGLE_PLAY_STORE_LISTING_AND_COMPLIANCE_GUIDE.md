# Google Play Store Listing & Compliance Guide
**Application:** MIRUS Field Force (`com.umanexus.fieldforce`)  
**Production URL:** `https://hrms-mirus.com`  
**Privacy Policy:** `https://hrms-mirus.com/privacy-policy`  
**Account Deletion:** `https://hrms-mirus.com/account-deletion`  

---

## Quick Reference Summary

| Console Section | Required Action / Selection | Key Value / File |
| :--- | :--- | :--- |
| **Ads** | Select **"No, my app does not contain ads"** | Verified zero ad SDKs in codebase |
| **Content Rating** | Category: **Utility / Business / Productivity** | Rating: **Everyone (3+)** |
| **Target Audience** | Select age group: **18 and over** | Appeal to children: **No** |
| **Data Safety** | Declare: Personal Info (Name, Email, User IDs), Files/Docs (Receipts), Device IDs (FCM Push) | Encrypted: **Yes** \| Deletion: **Yes** |
| **App Icon** | 512 × 512 px PNG (32-bit with alpha) | [`store-assets/app_icon_512x512.png`](file:///c:/projects/mirus-mobile/store-assets/app_icon_512x512.png) |
| **Feature Graphic** | 1024 × 500 px PNG / JPEG (24-bit RGB) | [`store-assets/feature_graphic_1024x500.png`](file:///c:/projects/mirus-mobile/store-assets/feature_graphic_1024x500.png) |
| **Screenshots** | At least 2 phone screenshots (9:16 aspect ratio, 1080 × 1920 px) | [`store-assets/screenshot_1_attendance_punch.png`](file:///c:/projects/mirus-mobile/store-assets/screenshot_1_attendance_punch.png)<br>[`store-assets/screenshot_2_daily_call_reports.png`](file:///c:/projects/mirus-mobile/store-assets/screenshot_2_daily_call_reports.png)<br>[`store-assets/screenshot_3_monthly_tour_plans.png`](file:///c:/projects/mirus-mobile/store-assets/screenshot_3_monthly_tour_plans.png)<br>[`store-assets/screenshot_4_field_expenses.png`](file:///c:/projects/mirus-mobile/store-assets/screenshot_4_field_expenses.png) |

---

## 1. Ads Declaration

**Navigation:** Google Play Console &rarr; **Policy and programs** &rarr; **App content** &rarr; **Ads**

1. When asked: **"Does your app contain ads?"**
2. Select:
   > 🔘 **No, my app does not contain ads**
3. Click **Save**.

### Rationale & Verification
- The MIRUS Field Force application is an enterprise internal HRMS and field-force management tool.
- Automated code scan confirms **zero advertising frameworks** (no Google AdMob, Unity, Meta Audience Network, or interstitial tracking SDKs).

---

## 2. Content Rating Questionnaire

**Navigation:** Google Play Console &rarr; **Policy and programs** &rarr; **App content** &rarr; **Content ratings** &rarr; **Start questionnaire**

### Step 1: Category Selection
- **Email address:** Your official administrator or support email (e.g., `support@hrms-mirus.com` or your Play Console account email).
- **Category:** Select **Utility, Productivity, Communication, or Other** (or **Enterprise / Business** depending on console locale).

### Step 2: Questionnaire Answers
Answer every question as follows:
- **Violence:** No
- **Sexuality / Nudity:** No
- **Language / Profanity:** No
- **Controlled Substances:** No  
  *(Note: Even though field reps promote pharmaceutical products to doctors, the app does not sell, prescribe, or distribute pharmaceuticals to consumers. Select "No".)*
- **Promotion of age-restricted goods:** No
- **Miscellaneous / User Interactions:**
  - *Does the app allow users to interact or exchange content with other users through voice, text, or sharing photos?* &rarr; **No** *(Content is private business data within the tenant organisation, not open public social networking).*
  - *Does the app share the user's current and precise physical location with other users?* &rarr; **No** *(The app does not share live GPS tracks).*
  - *Does the app allow users to purchase digital goods?* &rarr; **No** *(No in-app purchases or subscriptions).*

### Expected Result
- **Rating:** **Everyone / 3+ / USK 0 / PEGI 3 / IARC 3+**
- Click **Save** and then **Submit**.

---

## 3. Target Audience and Content

**Navigation:** Google Play Console &rarr; **Policy and programs** &rarr; **App content** &rarr; **Target audience and content**

### Step 1: Target Age Group
- Under **Target age**:
  - ☑ **18 and over**
  - *(Leave all other boxes unchecked: 16-17, 13-15, 9-12, 6-8, 5 and under).*
- Click **Next**.

### Step 2: Appeal to Children
- Question: **"Could your store listing unintentionally appeal to children?"**
- Select:
  > 🔘 **No**
- Rationale: The app store listing presents enterprise business software ("Field Force Management", "Daily Call Reports", "MTP Tour Plans", "Expense Reimbursements") with corporate branding and contains zero cartoon imagery, gamification, or youth-oriented styling.
- Click **Save**.

---

## 4. Data Safety Declaration (Detailed Breakdown)

**Navigation:** Google Play Console &rarr; **Policy and programs** &rarr; **App content** &rarr; **Data safety**

### Step 1: Data Collection & Security
- **Does your app collect or share any of the required user data types?** &rarr; **Yes**
- **Is all of the user data collected by your app encrypted in transit?** &rarr; **Yes** *(Encrypted via HTTPS / TLS 1.3 protocol)*
- **Do you provide a way for users to request that their data be deleted?** &rarr; **Yes**
- **Add a link that users can use to request data deletion:**
  ```
  https://hrms-mirus.com/account-deletion
  ```
- *(Note: Users can also request deletion directly within the mobile application via `More -> Account Deletion`).*

---

### Step 2: Data Types to Select

#### A. Personal info
Select:
- ☑ **Name**
- ☑ **Email address**
- ☑ **User IDs** (Employee Code / Login ID)

#### B. Location
- **Select NONE**.  
  *Technical context:* `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` are **not requested in `AndroidManifest.xml`**. Attendance punch records timestamps (`punchInAt`, `punchOutAt`). Travel expense station names (e.g. Pune &rarr; Mumbai) are user-typed text strings, not device GPS telemetry.

#### C. Photos and videos & Files and docs
Select:
- ☑ **Photos** *(Optional receipt photos uploaded for expense reimbursement)*
- ☑ **Files and docs** *(Optional PDF bills/receipts uploaded for expense reimbursement)*

#### D. Device or other IDs
Select:
- ☑ **Device or other IDs** *(Push notification token via Expo / Firebase Cloud Messaging)*

---

### Step 3: Specific Disclosures for Each Data Type

#### 1. Name, Email Address, User IDs
- **Collected?** &rarr; Yes
- **Shared?** &rarr; No *(Never shared with 3rd parties, brokers, or ad networks)*
- **Processed ephemerally?** &rarr; No *(Stored in secure tenant database)*
- **Is data collection required or optional?** &rarr; **Data collection is required** *(User cannot access the corporate app without an assigned account)*
- **Why is this user data collected?**
  - ☑ **App functionality**
  - ☑ **Account management**

#### 2. Photos & Files and docs (Expense Receipts)
- **Collected?** &rarr; Yes
- **Shared?** &rarr; No
- **Processed ephemerally?** &rarr; No *(Retained for accounting and audit compliance)*
- **Is data collection required or optional?** &rarr; **Users can choose whether this data is collected (Optional)** *(Employees can file expenses without attaching a receipt if not mandatory)*
- **Why is this user data collected?**
  - ☑ **App functionality** *(Expense claim auditing and reimbursement)*

#### 3. Device or other IDs (FCM Push Notification Token)
- **Collected?** &rarr; Yes
- **Shared?** &rarr; No
- **Processed ephemerally?** &rarr; No
- **Is data collection required or optional?** &rarr; **Data collection is required**
- **Why is this user data collected?**
  - ☑ **App functionality** *(Delivering manager approval alerts, tour schedule notifications, and operational reminders)*

---

## 5. Store Listing Graphics

All required graphic assets have been generated and verified in two locations:
1. Primary folder: [`store-assets/`](file:///c:/projects/mirus-mobile/store-assets)
2. Mobile asset folder: [`mobile/assets/play-store/`](file:///c:/projects/mirus-mobile/mobile/assets/play-store)

### Asset Specifications & Verification Table

| Asset Type | File Name | Required Dimensions | Aspect Ratio | Format / Color | Size (KB) | Google Play Limit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **App Icon** | `app_icon_512x512.png` | **512 × 512 px** | 1:1 (Square) | 32-bit PNG (with alpha) | 42.4 KB | Max 1024 KB |
| **Feature Graphic** | `feature_graphic_1024x500.png` | **1024 × 500 px** | 2.048:1 | 24-bit RGB PNG (no transparency) | 76.9 KB | Max 15 MB |
| **Screenshot 1** | `screenshot_1_attendance_punch.png` | **1080 × 1920 px** | 9:16 (Portrait) | PNG | 110.8 KB | Max 8 MB |
| **Screenshot 2** | `screenshot_2_daily_call_reports.png` | **1080 × 1920 px** | 9:16 (Portrait) | PNG | 135.8 KB | Max 8 MB |
| **Screenshot 3** | `screenshot_3_monthly_tour_plans.png` | **1080 × 1920 px** | 9:16 (Portrait) | PNG | 145.1 KB | Max 8 MB |
| **Screenshot 4** | `screenshot_4_field_expenses.png` | **1080 × 1920 px** | 9:16 (Portrait) | PNG | 144.3 KB | Max 8 MB |

### Description of Generated Visuals
1. **App Icon (`app_icon_512x512.png`):**
   - High-resolution vector-rendered MIRUS golden-amber geometric mark on a clean white background with subtle depth and official "FIELD FORCE" brand badge.
   - Square format with 20% safe margins so Google Play's dynamic squircle mask does not crop the emblem.
2. **Feature Graphic (`feature_graphic_1024x500.png`):**
   - Deep slate enterprise gradient with ambient gold illumination.
   - Official MIRUS logo, category badge "ENTERPRISE WORKFORCE & PHARMA", value proposition headline, and feature checklist.
   - Smartphone mockup on the right showcasing real live dashboard metrics (Attendance punch card, DCR progress bar, quick actions).
   - Strict adherence to the 15% safe zone on all edges.
3. **Screenshots (1080 × 1920 px, 9:16):**
   - **Screenshot 1:** Attendance & Duty Tracking (One-tap Punch In/Out, Shift Duration, Present status badge, Leave balance).
   - **Screenshot 2:** Daily Call Reporting (DCR) (12 Total calls, 9 Completed, 3 Pending; Individual/Joint doctor visits, specialty, sample notes).
   - **Screenshot 3:** Monthly Tour Plans (MTP) (October 2026 tour calendar, adherence metrics, multi-day scheduled blocks, ASM approvals).
   - **Screenshot 4:** Expense Claims & Receipts (Monthly claim totals, Travel, Food/DA, Hotel stay, digital receipt file attachments).

---

## 6. How to Upload in Google Play Console

1. Navigate to: **Grow users** &rarr; **Store presence** &rarr; **Main store listing**.
2. Scroll to **Listing assets**:
   - **App icon:** Drag & drop `store-assets/app_icon_512x512.png`.
   - **Feature graphic:** Drag & drop `store-assets/feature_graphic_1024x500.png`.
   - **Phone screenshots:** Drag & drop:
     1. `screenshot_1_attendance_punch.png`
     2. `screenshot_2_daily_call_reports.png`
     3. `screenshot_3_monthly_tour_plans.png`
     4. `screenshot_4_field_expenses.png`
3. Click **Save** in the bottom right corner.
