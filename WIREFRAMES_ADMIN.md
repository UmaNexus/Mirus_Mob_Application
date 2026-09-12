# ADMIN & HR PORTAL WIREFRAMES

## Layout: Main Dashboard Layout
+-----------------------------------------------------------------------------------------+

| [XYZ LOGO]  HRMS Admin Portal                   | 🔍 Search Everything... | 👤 Me (Admin) |
+-----------------------------------------------------------------------------------------+

| 📊 Dashboard          |  Welcome Back, Admin!                                           |
| 👥 User Management    |  +-------------------+ +-------------------+ +----------------+ |
| 📄 Offer Letters      |  | Total Employees   | | Pending Offers    | | Slips Issued   | |
| 💰 Salary Slips       |  | 142               | | 12                | | 138 (June 2026)| |
| ⚙️ Setup Templates    |  +-------------------+ +-------------------+ +----------------+ |
|                       |                                                                 |
|                       |  🕒 Recent Activity Log (Latest 5)                              |
|                       |  • [10:15 AM] Rahul Kumar accepted offer letter (EMP45872)      |
|                       |  • [09:00 AM] Bulk ingestion parser completed: 14 candidates     |
| 🚪 Logout             |  • [Yesterday] New Salary Model 'Engineering-V2' created        |
+-----------------------+-----------------------------------------------------------------+

## Module 1: Profile & Admin Details Configuration
+-----------------------------------------------------------------------------------------+

| Profile Settings                                                                        |
+-----------------------------------------------------------------------------------------+

|  +-----------------------+   Personal Details Form                                      |
|  |  +-----------------+  |   First Name: [ Admin             ]  Last Name: [ System  ] |
|  |  |                 |  |   Work Email: [ admin@xyz.com     ]  Phone:     [ 9876543210 ] |
|  |  |  (Avatar Image) |  |                                                              |
|  |  |                 |  |   Security Security                                          |
|  |  +-----------------+  |   Current Password: [ ********** ]                           |
|  |   [⬆️ Upload New]     |   New Password:     [            ]                           |
|  |   [🗑️ Delete Avatar]  |                                                              |
|  +-----------------------+   +---------------+   +--------------+                       |
|                              | 💾 Save Changes |   | 🚪 Logout    |                       |
|                              +---------------+   +--------------+                       |
+-----------------------------------------------------------------------------------------+

## Module 2: User Directory Management Table
+-----------------------------------------------------------------------------------------+

| User Management Directory                                                               |
+-----------------------------------------------------------------------------------------+

|  🔍 [ Search by name, employee ID, role...              ]  ⚙️ Filter: [ Status ▾ ] [Role ▾]|
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | ID       | Name             | Department  | Role     | Status     | Actions       |  |
|  +----------+------------------+-------------+----------+------------+---------------+  |
|  | EMP45872 | Rahul Kumar      | Engineering | Employee | 🟢 Active  | [📝Edit] [🗑️] |  |
|  | EMP45871 | Priya Sharma     | HR          | HR       | 🟢 Active  | [📝Edit] [🗑️] |  |
|  | ---      | Amit Patel       | Marketing   | Employee | 🟡 Onboard | [📝Edit] [🗑️] |  |
|  +-----------------------------------------------------------------------------------+  |
|  Showing 1-10 of 142 entries                                  [⏮️ Prev]  (1) 2 3  [⏭️ Next] |
+-----------------------------------------------------------------------------------------+

## Module 3: Offer Letter Management Matrix
+-----------------------------------------------------------------------------------------+

| Offer Letter Management                                                                 |
+-----------------------------------------------------------------------------------------+

|  🔍 [ Search Candidate...    ]  Filter: [ Status ▾ ]    [+ Create Single] [📁 Bulk XLSX] |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | Candidate Name | Applied Position      | Offer Date  | Status     | Actions       |  |
|  +----------------+-----------------------+-------------+------------+---------------+  |
|  | Vikram Singh   | UI/UX Designer        | 22/06/2026  | 🟡 Sent    | [👁️View] [🔁]  |  |
|  | Neha Gupta     | QA Engineer           | 18/06/2026  | 🟢 Accepted| [👁️View] [📥]  |  |
|  | Rajesh Kumar   | DevOps Specialist     | 15/06/2026  | 🔴 Declined| [👁️View] [🗑️]  |  |
|  +-----------------------------------------------------------------------------------+  |
|                                                                                         |
|  +------------------------------------------------------------------------------------+ |
|  | 📁 Bulk Ingestion Drag-and-Drop Dropzone                                           | |
|  | [ Drag & Drop onboarding_roster.xlsx here or Click to Browse ]                     | |
|  +------------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------------+

## Module 4: Dynamic Salary Template Creator View
+-----------------------------------------------------------------------------------------+

| Salary Model Configuration: [ Senior Engineer Package     ] (Persisted Schema Template)  |
+-----------------------------------------------------------------------------------------+

|  Earnings Structure Block                      Deductions Structure Block               |
|  +------------------------------------------+  +-------------------------------------+  |
|  | Field Key | Label      | Formula/Fixed   |  | Field Key | Label   | Formula       |  |
|  +-----------+------------+-----------------+  +-----------+---------+---------------+  |
|  | basic     | Basic Pay  | 45% of CTC      |  | pf        | PF      | 12% of Basic  |  |
|  | hra       | HRA        | 50% of Basic    |  | pt        | PT      | Fixed: ₹200   |  |
|  | special   | Special All| Remaining Fixed |  | tds       | TDS     | Dynamic Calc  |  |
|  +-----------+------------+-----------------+  +-----------+---------+---------------+  |
|  [➕ Add Earning Row]                          [➕ Add Deduction Row]                    |
|                                                                                         |
|  +----------------------------------------+                                             |
|  | 💾 Save Dynamic Salary Model Structure |                                             |
|  +----------------------------------------+                                             |
+-----------------------------------------------------------------------------------------+

## Module 5: Pay Slip Ledger Distribution Matrix
+-----------------------------------------------------------------------------------------+

| Salary Slip Management                                                                  |
+-----------------------------------------------------------------------------------------+

|  Select Period: [ June ▾ ] [ 2026 ▾ ]                      [⚡ Bulk Process Selected]   |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | ☑️ | Employee ID | Employee Name    | Department  | Net Pay   | Payroll Status     |  |
|  +---+-------------+------------------+-------------+-----------+--------------------+  |
|  | ☑️ | EMP45872    | Rahul Kumar      | Engineering | ₹84,900   | 🟢 Paid ([📥] [✉️]) |  |
|  | ☑️ | EMP45871    | Priya Sharma     | HR          | ₹72,100   | 🟢 Paid ([📥] [✉️]) |  |
|  | ☐ | EMP45860    | Sunny Deol       | Operations  | ₹95,000   | 🟡 Processing      |  |
|  +-----------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------+
