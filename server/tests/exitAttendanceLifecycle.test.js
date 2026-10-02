import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import User from '../models/User.js';
import ExitRecord from '../models/ExitRecord.js';
import Attendance from '../models/Attendance.js';
import { authAgent, createUser } from './helpers/factories.js';
import { syncExitedUsersStatus, startExitSyncScheduler } from '../services/exitSyncService.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('1. initiateExit with past lastWorkingDay immediately deactivates the user', async () => {
  const { agent, user: admin } = await authAgent(app, { role: 'admin' });
  const emp = await createUser({ companyId: admin.companyId, email: 'past-lwd@xyz.com', role: 'employee', isActive: true });

  const pastDate = '2026-09-01';
  const res = await agent.post('/api/exits').send({
    userId: String(emp._id),
    resignationDate: '2026-08-15',
    lastWorkingDay: pastDate,
    reason: 'Better opportunity'
  });

  assert.equal(res.status, 201);
  const refreshedUser = await User.findById(emp._id);
  assert.equal(refreshedUser.isActive, false, 'User must be deactivated immediately when lastWorkingDay is in past');
});

test('2. initiateExit with future lastWorkingDay keeps user active during notice period', async () => {
  const { agent, user: admin } = await authAgent(app, { role: 'admin' });
  const emp = await createUser({ companyId: admin.companyId, email: 'future-lwd@xyz.com', role: 'employee', isActive: true });

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const futureStr = futureDate.toISOString().slice(0, 10);

  const res = await agent.post('/api/exits').send({
    userId: String(emp._id),
    resignationDate: new Date().toISOString().slice(0, 10),
    lastWorkingDay: futureStr,
    reason: 'Relocating'
  });

  assert.equal(res.status, 201);
  const refreshedUser = await User.findById(emp._id);
  assert.equal(refreshedUser.isActive, true, 'User must remain active while serving notice period');
});

test('3. updateExit with status Completed deactivates the employee', async () => {
  const { agent, user: admin } = await authAgent(app, { role: 'admin' });
  const emp = await createUser({ companyId: admin.companyId, email: 'complete-exit@xyz.com', role: 'employee', isActive: true });

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);

  const exit = await ExitRecord.create({
    companyId: admin.companyId,
    userId: emp._id,
    resignationDate: new Date(),
    lastWorkingDay: futureDate,
    reason: 'Personal',
    status: 'Initiated'
  });

  const res = await agent.patch(`/api/exits/${exit._id}`).send({ status: 'Completed' });
  assert.equal(res.status, 200);

  const refreshedUser = await User.findById(emp._id);
  assert.equal(refreshedUser.isActive, false, 'User must be deactivated when exit status is marked Completed');
});

test('4. updateExit with F&F Settled deactivates the employee', async () => {
  const { agent, user: admin } = await authAgent(app, { role: 'admin' });
  const emp = await createUser({ companyId: admin.companyId, email: 'fnf-settled@xyz.com', role: 'employee', isActive: true });

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);

  const exit = await ExitRecord.create({
    companyId: admin.companyId,
    userId: emp._id,
    resignationDate: new Date(),
    lastWorkingDay: futureDate,
    reason: 'Personal',
    status: 'InProgress'
  });

  const res = await agent.patch(`/api/exits/${exit._id}`).send({
    fnfSettlement: { status: 'Settled', amount: 4500000 }
  });
  assert.equal(res.status, 200);

  const refreshedUser = await User.findById(emp._id);
  assert.equal(refreshedUser.isActive, false, 'User must be deactivated when F&F is Settled');
});

test('5. syncExitedUsersStatus deactivates expired notice periods but keeps active notice periods', async () => {
  const { user: admin } = await authAgent(app, { role: 'admin' });

  // User 1: Notice period expired yesterday
  const empExpired = await createUser({ companyId: admin.companyId, email: 'expired@xyz.com', role: 'employee', isActive: true });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await ExitRecord.create({
    companyId: admin.companyId,
    userId: empExpired._id,
    resignationDate: new Date(Date.now() - 30 * 86400000),
    lastWorkingDay: yesterday,
    status: 'Initiated'
  });

  // User 2: Notice period still active (expires in 15 days)
  const empActiveNotice = await createUser({ companyId: admin.companyId, email: 'active-notice@xyz.com', role: 'employee', isActive: true });
  const in15Days = new Date();
  in15Days.setDate(in15Days.getDate() + 15);
  await ExitRecord.create({
    companyId: admin.companyId,
    userId: empActiveNotice._id,
    resignationDate: new Date(),
    lastWorkingDay: in15Days,
    status: 'Initiated'
  });

  // User 3: Regular active employee with no exit
  const empRegular = await createUser({ companyId: admin.companyId, email: 'regular@xyz.com', role: 'employee', isActive: true });

  // Run the background sync
  await syncExitedUsersStatus();

  assert.equal((await User.findById(empExpired._id)).isActive, false, 'Expired notice employee should be deactivated');
  assert.equal((await User.findById(empActiveNotice._id)).isActive, true, 'Active notice employee should remain active');
  assert.equal((await User.findById(empRegular._id)).isActive, true, 'Regular employee should remain active');
});

test('6. upsertAttendance blocks marking attendance for dates strictly after lastWorkingDay', async () => {
  const { agent, user: admin } = await authAgent(app, { role: 'admin' });
  const emp = await createUser({ companyId: admin.companyId, email: 'att-block@xyz.com', role: 'employee', isActive: true });

  const lwd = '2026-09-15';
  await ExitRecord.create({
    companyId: admin.companyId,
    userId: emp._id,
    resignationDate: '2026-09-01',
    lastWorkingDay: new Date('2026-09-15T00:00:00.000Z'),
    status: 'Completed'
  });

  // 1. Marking on or before LWD should succeed
  const resValid = await agent.post('/api/attendance').send({
    userId: String(emp._id),
    date: '2026-09-14',
    status: 'Present'
  });
  assert.equal(resValid.status, 200);

  // 2. Marking after LWD should be blocked
  const resInvalid = await agent.post('/api/attendance').send({
    userId: String(emp._id),
    date: '2026-09-16',
    status: 'Present'
  });
  assert.equal(resInvalid.status, 400);
  assert.match(resInvalid.body.message, /last working day/i);
});

test('7. punchIn blocks mobile punch-in when today is past lastWorkingDay', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { agent, user: emp } = await authAgent(app, {
    role: 'employee',
    employeeDetails: { fieldForce: { tier: 'BDM' } }
  });

  await ExitRecord.create({
    companyId: emp.companyId,
    userId: emp._id,
    resignationDate: new Date(Date.now() - 30 * 86400000),
    lastWorkingDay: yesterday,
    status: 'Completed'
  });

  const res = await agent.post('/api/attendance/punch-in');
  assert.equal(res.status, 403);
  assert.match(res.body.message, /last working day/i);
});

test('8. markBulkAttendance skips exited employees past LWD without failing other employees', async () => {
  const { agent, user: admin } = await authAgent(app, { role: 'admin' });

  const empActive = await createUser({ companyId: admin.companyId, email: 'bulk-active@xyz.com', role: 'employee', isActive: true });
  const empExited = await createUser({ companyId: admin.companyId, email: 'bulk-exited@xyz.com', role: 'employee', isActive: false });

  await ExitRecord.create({
    companyId: admin.companyId,
    userId: empExited._id,
    resignationDate: '2026-08-01',
    lastWorkingDay: new Date('2026-08-31'),
    status: 'Completed'
  });

  const res = await agent.post('/api/attendance/bulk').send({
    userIds: [String(empActive._id), String(empExited._id)],
    date: '2026-09-20',
    status: 'Present'
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.count, 1, 'Only the active employee should have attendance recorded');

  // Verify only active employee got attendance record for that day
  const activeAtt = await Attendance.findOne({ userId: empActive._id, dateKey: '2026-09-20' });
  const exitedAtt = await Attendance.findOne({ userId: empExited._id, dateKey: '2026-09-20' });
  assert.ok(activeAtt, 'Active employee attendance should exist');
  assert.equal(exitedAtt, null, 'Exited employee should have NO attendance record');
});

test('9. Exited employee is excluded from listUsers when querying active employees for attendance roster', async () => {
  const { agent, user: admin } = await authAgent(app, { role: 'admin' });

  const empActive = await createUser({
    companyId: admin.companyId,
    email: 'roster-active@xyz.com',
    role: 'employee',
    isActive: true,
    employeeDetails: { employeeId: 'MMS9001' }
  });

  const empExited = await createUser({
    companyId: admin.companyId,
    email: 'roster-exited@xyz.com',
    role: 'employee',
    isActive: true,
    employeeDetails: { employeeId: 'MMS9002' }
  });

  // Exit empExited
  await agent.post('/api/exits').send({
    userId: String(empExited._id),
    resignationDate: '2026-08-01',
    lastWorkingDay: '2026-08-15',
    reason: 'Exited'
  });

  // Query as AttendanceAdminPage does:
  const res = await agent.get('/api/users').query({
    limit: 200,
    role: 'employee',
    status: 'active',
    employeesOnly: 'true'
  });

  assert.equal(res.status, 200);
  const userIds = res.body.data.map((u) => String(u._id));
  assert.ok(userIds.includes(String(empActive._id)), 'Active employee must be in attendance roster');
  assert.ok(!userIds.includes(String(empExited._id)), 'Exited employee must NOT be in attendance roster');
});
