import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import Notification from '../models/Notification.js';
import Doctor from '../models/Doctor.js';
import DailyCallReport from '../models/DailyCallReport.js';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import Stockist from '../models/Stockist.js';
import { authAgent, createUser, getDefaultCompany } from './helpers/factories.js';
import { checkDoctorBirthdaysToday } from '../services/notificationSchedulerService.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const loginAs = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return agent;
};

let counter = 0;
const setupHierarchy = async () => {
  counter += 1;
  const n = counter;
  const company = await getDefaultCompany();
  const { agent: adminAgent, user: admin } = await authAgent(app, {
    email: `admin_${n}@xyz.com`,
    role: 'admin',
  });
  const { agent: asmAgent, user: asm } = await authAgent(app, {
    email: `asm_${n}@xyz.com`,
    employeeDetails: { fieldForce: { tier: 'ASM' } },
  });
  const bdm = await createUser({
    companyId: company._id,
    email: `bdm_${n}@xyz.com`,
    password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id },
  });
  const bdmAgent = await loginAs(company, bdm);
  return { company, admin, adminAgent, asm, asmAgent, bdm, bdmAgent };
};

// ---------- 1. Device Token Management ----------

test('registers and unregisters an Expo push token for an authenticated user', async () => {
  const { bdmAgent } = await setupHierarchy();

  const regRes = await bdmAgent.post('/api/notifications/devices/register').send({
    token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    platform: 'android',
    deviceId: 'device-abc-123',
  });
  assert.equal(regRes.status, 200);
  assert.equal(regRes.body.success, true);

  const unregRes = await bdmAgent.post('/api/notifications/devices/unregister').send({
    token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  });
  assert.equal(unregRes.status, 200);
  assert.equal(unregRes.body.success, true);
});

// ---------- 2. In-App Notification Center & Unread Count ----------

test('in-app notifications can be listed, filtered, and marked as read', async () => {
  const { company, bdm, bdmAgent } = await setupHierarchy();

  await Notification.create({
    companyId: company._id,
    recipientId: bdm._id,
    module: 'alert',
    eventId: 'TEST_ALERT',
    title: 'Test Notification',
    body: 'Testing notification flow',
    priority: 'high',
  });

  const listRes = await bdmAgent.get('/api/notifications');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.notifications.length, 1);
  assert.equal(listRes.body.pagination.unreadCount, 1);

  const notifId = listRes.body.notifications[0]._id;
  const readRes = await bdmAgent.patch(`/api/notifications/${notifId}/read`);
  assert.equal(readRes.status, 200);
  assert.equal(readRes.body.notification.isRead, true);

  const countRes = await bdmAgent.get('/api/notifications/unread-count');
  assert.equal(countRes.status, 200);
  assert.equal(countRes.body.unreadCount, 0);
});

// ---------- 3. Leave Request Workflow & Notifications ----------

test('applying and deciding leave generates notifications for manager and BDM', async () => {
  const { bdmAgent, asmAgent, asm, bdm } = await setupHierarchy();

  // BDM applies for leave
  const applyRes = await bdmAgent.post('/api/leaves').send({
    type: 'Casual',
    fromDate: '2026-11-10',
    toDate: '2026-11-12',
    reason: 'Family event',
  });
  assert.equal(applyRes.status, 201);
  const leaveId = applyRes.body.leave._id;

  // Manager receives LEAVE_SUBMITTED
  const asmNotifs = await Notification.find({ recipientId: asm._id, eventId: 'LEAVE_SUBMITTED' });
  assert.equal(asmNotifs.length, 1);
  assert.match(asmNotifs[0].title, /New Leave Application/);

  // Manager approves leave
  const decideRes = await asmAgent.patch(`/api/leaves/${leaveId}/decision`).send({
    status: 'Approved',
    note: 'Have a good time',
  });
  assert.equal(decideRes.status, 200);

  // BDM receives LEAVE_APPROVED
  const bdmNotifs = await Notification.find({ recipientId: bdm._id, eventId: 'LEAVE_APPROVED' });
  assert.equal(bdmNotifs.length, 1);
  assert.match(bdmNotifs[0].title, /Leave Request Approved/);
});

// ---------- 4. Expense Claim Workflow & High-Value Alert ----------

test('submitting expense creates notification for manager and triggers high-value alert', async () => {
  const { bdmAgent, asmAgent, asm, bdm } = await setupHierarchy();

  // High-value claim > 10,000 INR
  const expRes = await bdmAgent.post('/api/expenses').send({
    category: 'Travel',
    date: '2026-11-01',
    amount: 12500,
    from: 'Pune',
    to: 'Bangalore',
  });
  assert.equal(expRes.status, 201);
  const expenseId = expRes.body.expense._id;

  // Manager should receive both EXPENSE_SUBMITTED and EXPENSE_HIGH_VALUE_ALERT
  const submittedNotif = await Notification.findOne({ recipientId: asm._id, eventId: 'EXPENSE_SUBMITTED' });
  assert.ok(submittedNotif);
  assert.match(submittedNotif.title, /New Expense Claim/);

  const highValNotif = await Notification.findOne({ recipientId: asm._id, eventId: 'EXPENSE_HIGH_VALUE_ALERT' });
  assert.ok(highValNotif);

  // Manager rejects expense
  const decideRes = await asmAgent.patch(`/api/expenses/${expenseId}/decision`).send({
    status: 'rejected',
    note: 'Flight tickets not attached',
  });
  assert.equal(decideRes.status, 200);

  // BDM receives EXPENSE_REJECTED
  const bdmNotif = await Notification.findOne({ recipientId: bdm._id, eventId: 'EXPENSE_REJECTED' });
  assert.ok(bdmNotif);
  assert.match(bdmNotif.body, /Flight tickets not attached/);
});

// ---------- 5. MTP Workflow & Notifications ----------

test('MTP submit, withdraw, and approve dispatch appropriate notifications', async () => {
  const { bdmAgent, asmAgent, asm, bdm } = await setupHierarchy();

  // BDM creates draft MTP
  const createRes = await bdmAgent.post('/api/mtp').send({
    month: '2026-12',
    remarks: 'Q4 expansion',
  });
  assert.equal(createRes.status, 201);
  const planId = createRes.body.mtp._id;

  // BDM submits MTP
  const submitRes = await bdmAgent.patch(`/api/mtp/${planId}/submit`).send({
    approverId: asm._id,
  });
  assert.equal(submitRes.status, 200);

  // Manager receives MTP_SUBMITTED
  const asmNotif = await Notification.findOne({ recipientId: asm._id, eventId: 'MTP_SUBMITTED' });
  assert.ok(asmNotif);
  assert.match(asmNotif.title, /MTP Submitted: 2026-12/);

  // Manager approves MTP
  const decideRes = await asmAgent.patch(`/api/mtp/${planId}/decision`).send({
    status: 'approved',
    note: 'Approved for travel',
  });
  assert.equal(decideRes.status, 200);

  // BDM receives MTP_APPROVED
  const bdmNotif = await Notification.findOne({ recipientId: bdm._id, eventId: 'MTP_APPROVED' });
  assert.ok(bdmNotif);
  assert.match(bdmNotif.title, /Tour Plan Approved/);
});

// ---------- 6. DCR Joint Call & Day Submission Notifications ----------

test('DCR joint call and daily submission notify manager and peer', async () => {
  const { company, bdmAgent, asm, bdm } = await setupHierarchy();

  const doctor = await Doctor.create({
    companyId: company._id,
    name: 'Sharma',
    speciality: 'Cardiology',
    area: 'Central',
    assignedTo: bdm._id,
    createdBy: asm._id,
  });

  // Log a joint call with ASM
  const jointRes = await bdmAgent.post('/api/dcr').send({
    date: '2026-11-05',
    type: 'joint',
    doctorId: doctor._id,
    accompaniedBy: asm._id,
  });
  assert.equal(jointRes.status, 201);

  // ASM receives DCR_JOINT_CALL_NOTIFICATION
  const jointNotif = await Notification.findOne({ recipientId: asm._id, eventId: 'DCR_JOINT_CALL_NOTIFICATION' });
  assert.ok(jointNotif);
  assert.match(jointNotif.body, /tagged you in a joint call/);

  // Complete call
  await bdmAgent.patch(`/api/dcr/${jointRes.body.dcr._id}`).send({
    status: 'completed',
    feedback: 'Good discussion',
  });

  // Submit day DCR
  const submitDayRes = await bdmAgent.patch('/api/dcr/submit-day').send({
    date: '2026-11-05',
  });
  assert.equal(submitDayRes.status, 200);

  // Manager receives DCR_SUBMITTED
  const dcrSubNotif = await Notification.findOne({ recipientId: asm._id, eventId: 'DCR_SUBMITTED' });
  assert.ok(dcrSubNotif);
});

// ---------- 7. Doctor Assignment & Reassignment Notifications ----------

test('creating doctor and reassigning doctor dispatches DOCTOR_ASSIGNED_NEW and DOCTOR_REASSIGNED_TRANSFER', async () => {
  const { company, asmAgent, bdm, asm } = await setupHierarchy();

  const bdm2 = await createUser({
    companyId: company._id,
    email: 'bdm2@xyz.com',
    password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id },
  });

  // ASM creates doctor assigned to BDM
  const createDocRes = await asmAgent.post('/api/doctors').send({
    name: 'Gupta',
    speciality: 'Orthopedic',
    area: 'North',
    assignedTo: bdm._id,
  });
  assert.equal(createDocRes.status, 201);
  const doctorId = createDocRes.body.doctor._id;

  // BDM receives DOCTOR_ASSIGNED_NEW
  const assignNotif = await Notification.findOne({ recipientId: bdm._id, eventId: 'DOCTOR_ASSIGNED_NEW' });
  assert.ok(assignNotif);
  assert.match(assignNotif.title, /New Doctor Assigned/);

  // ASM reassigns doctor to BDM2
  const updateDocRes = await asmAgent.patch(`/api/doctors/${doctorId}`).send({
    assignedTo: bdm2._id,
  });
  assert.equal(updateDocRes.status, 200);

  // BDM receives DOCTOR_REASSIGNED_TRANSFER
  const transferNotif = await Notification.findOne({ recipientId: bdm._id, eventId: 'DOCTOR_REASSIGNED_TRANSFER' });
  assert.ok(transferNotif);

  // BDM2 receives DOCTOR_ASSIGNED_NEW
  const bdm2Notif = await Notification.findOne({ recipientId: bdm2._id, eventId: 'DOCTOR_ASSIGNED_NEW' });
  assert.ok(bdm2Notif);
});

// ---------- 8. Company Holiday Announcement Notification ----------

test('creating a holiday broadcasts HOLIDAY_ADDED to all company employees', async () => {
  const { adminAgent, bdm } = await setupHierarchy();

  const holRes = await adminAgent.post('/api/holidays').send({
    name: 'Diwali',
    date: '2026-11-15',
    optional: false,
  });
  assert.equal(holRes.status, 201);

  // Small delay for async broadcast promise
  await new Promise((resolve) => setTimeout(resolve, 100));

  const holNotif = await Notification.findOne({ recipientId: bdm._id, eventId: 'HOLIDAY_ADDED' });
  assert.ok(holNotif);
  assert.match(holNotif.title, /Company Holiday Announced/);
  assert.match(holNotif.body, /Diwali/);
});

// ---------- 9. Doctor Birthday Alert to BDM (User's specific requirement) ----------

test('doctor birthday alert fires for BDM with deep link to Todays Plan', async () => {
  const { company, bdm, asm } = await setupHierarchy();

  // Create a doctor whose birthday is today
  const today = new Date();
  const doc = await Doctor.create({
    companyId: company._id,
    name: 'Aditi Roy',
    speciality: 'Pediatrics',
    area: 'South',
    phone: '9876543210',
    dob: new Date(Date.UTC(1985, today.getUTCMonth(), today.getUTCDate())),
    assignedTo: bdm._id,
    createdBy: asm._id,
  });

  const result = await checkDoctorBirthdaysToday();
  assert.equal(result.success, true);
  assert.ok(result.alertsSent.length >= 1);

  const notif = await Notification.findOne({
    recipientId: bdm._id,
    eventId: 'DOCTOR_BIRTHDAY_ALERT',
    entityId: doc._id,
  });

  assert.ok(notif);
  assert.match(notif.title, /Doctor Birthday Today/);
  assert.match(notif.body, /Aditi Roy/);
  assert.equal(notif.deepLink, 'mirus://bdm/home?focus=todaysPlan');
  assert.equal(notif.data.screen, 'BdmHomeScreen');
  assert.equal(notif.data.focus, 'todaysPlan');
});

// ---------- 10. Secondary Sales Submission Notification ----------

test('secondary sales submission notifies reporting manager', async () => {
  const { company, bdmAgent, bdm, asm } = await setupHierarchy();

  const stockist = await Stockist.create({
    companyId: company._id,
    name: 'Apex Pharma Distributors',
    userId: bdm._id,
  });

  const saleRes = await bdmAgent.post('/api/secondary-sales').send({
    stockistId: stockist._id,
    productName: 'Amoxicillin 500mg',
    batchNumber: 'AMX-001',
    quantity: 100,
    value: 5000,
  });
  assert.equal(saleRes.status, 201);

  const notif = await Notification.findOne({ recipientId: asm._id, eventId: 'SECONDARY_SALES_SUBMITTED' });
  assert.ok(notif);
  assert.match(notif.body, /Amoxicillin 500mg/);
});

// ---------- 11. Scheduler On-Demand Trigger Endpoint ----------

test('POST /api/notifications/scheduler/run triggers scheduler checks on demand', async () => {
  const { adminAgent } = await setupHierarchy();

  const res = await adminAgent.post('/api/notifications/scheduler/run').send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.result);
});
