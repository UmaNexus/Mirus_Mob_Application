import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const loginAs = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return agent;
};

let setupCounter = 0;
const setupAsmBdm = async () => {
  setupCounter += 1;
  const n = setupCounter;
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: `asm_${n}@xyz.com`, employeeDetails: { fieldRole: 'ASM' } });
  const bdm = await createUser({
    companyId: company._id, email: `bdm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id }
  });
  const bdmAgent = await loginAs(company, bdm);
  return { company, asmAgent, asm, bdm, bdmAgent };
};

// ---------- Authentication / tier gating ----------

test('unauthenticated requests are rejected on every reporting endpoint', async () => {
  assert.equal((await request(app).get('/api/field-force/calendar')).status, 401);
  assert.equal((await request(app).get('/api/field-force/alerts')).status, 401);
  assert.equal((await request(app).get('/api/field-force/dashboard')).status, 401);
  assert.equal((await request(app).get('/api/field-force/monitor')).status, 401);
});

test('an employee with no field-force role is denied all reporting endpoints', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/field-force/calendar')).status, 403);
  assert.equal((await agent.get('/api/field-force/dashboard')).status, 403);
  assert.equal((await agent.get('/api/field-force/monitor')).status, 403);
});

// ---------- My reporting chain (joint-call/work-type manager picker) ----------

test('a BDM\'s reporting chain returns their real manager, and only their real manager', async () => {
  const { bdmAgent, asm } = await setupAsmBdm();
  const res = await bdmAgent.get('/api/field-force/my-chain');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(String(res.body.data[0]._id), String(asm._id));
});

test('a top-of-chain user (no reportingManagerId) gets an empty chain, not an error', async () => {
  const { agent } = await authAgent(app, { email: 'orphan@xyz.com', employeeDetails: { fieldRole: 'NSM' } });
  const res = await agent.get('/api/field-force/my-chain');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});

// ---------- Joint Call / Manager Meeting participants ----------

test('joint-call-participants returns managers (real chain, ASM+, never Admin) and others (same-ASM teammate BDMs)', async () => {
  const { company, bdmAgent, asm } = await setupAsmBdm();
  const teammate = await createUser({
    companyId: company._id, email: 'teammate-participants@xyz.com',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id }
  });
  const unrelatedBdm = await createUser({ companyId: company._id, email: 'unrelated-participants@xyz.com', employeeDetails: { fieldRole: 'BDM' } });

  const res = await bdmAgent.get('/api/field-force/joint-call-participants');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.managers.length, 1);
  assert.equal(String(res.body.data.managers[0]._id), String(asm._id));
  assert.equal(res.body.data.others.length, 1);
  assert.equal(String(res.body.data.others[0]._id), String(teammate._id));
  assert.ok(!res.body.data.others.some((u) => String(u._id) === String(unrelatedBdm._id)), 'an unrelated BDM must never appear in "others"');
});

test('joint-call-participants never returns Admin among managers, even when Admin is the literal top of the reporting chain', async () => {
  const company = await getDefaultCompany();
  const { user: admin } = await authAgent(app, { company, email: 'admin-participants@xyz.com', role: 'admin' });
  const nsm = await createUser({ companyId: company._id, email: 'nsm-participants@xyz.com', employeeDetails: { fieldRole: 'NSM', reportingManagerId: admin._id } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm-participants@xyz.com', password: 'Password1',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: nsm._id }
  });
  const bdmAgent = await loginAs(company, bdm);

  const res = await bdmAgent.get('/api/field-force/joint-call-participants');
  assert.equal(res.status, 200);
  const managerIds = res.body.data.managers.map((u) => String(u._id));
  assert.ok(managerIds.includes(String(nsm._id)));
  assert.ok(!managerIds.includes(String(admin._id)), 'Admin must never appear as a Joint Call manager option');
});

test('joint-call-participants "others" is empty for a top-of-chain user with no manager', async () => {
  const { agent } = await authAgent(app, { email: 'orphan-participants@xyz.com', employeeDetails: { fieldRole: 'BDM' } });
  const res = await agent.get('/api/field-force/joint-call-participants');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.others, []);
});

// ---------- Calendar ----------

test('calendar rejects a malformed month and returns the caller\'s own data for a valid one', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const bad = await bdmAgent.get('/api/field-force/calendar?month=2026-8');
  assert.equal(bad.status, 400);

  await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'individual' });
  const res = await bdmAgent.get('/api/field-force/calendar?month=2026-08');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.workTypes.length, 1);
});

test('a manager can view their own subtree BDM\'s calendar, but not an unrelated BDM\'s', async () => {
  const { asmAgent, bdm } = await setupAsmBdm();
  const { bdm: otherBdm } = await setupAsmBdm();

  const allowed = await asmAgent.get(`/api/field-force/calendar?month=2026-08&userId=${bdm._id}`);
  assert.equal(allowed.status, 200);

  const blocked = await asmAgent.get(`/api/field-force/calendar?month=2026-08&userId=${otherBdm._id}`);
  assert.equal(blocked.status, 403);
});

test('calendar surfaces the caller\'s real MTP plannedVisits for the month, from the existing MonthlyTourPlan model', async () => {
  const { asmAgent, bdm, bdmAgent } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Calendar A', area: 'Banjara Hills', assignedTo: String(bdm._id) });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Calendar B', area: 'Jubilee Hills', assignedTo: String(bdm._id) });
  const created = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ area: 'Banjara Hills', date: '2026-08-10' }, { area: 'Jubilee Hills', date: '2026-08-11' }]
  });
  assert.equal(created.status, 201, `mtp create failed: ${JSON.stringify(created.body)}`);

  const res = await bdmAgent.get('/api/field-force/calendar?month=2026-08');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.tourPlans.length, 1);
  assert.equal(res.body.data.tourPlans[0].plannedVisits.length, 2);
  assert.equal(res.body.data.tourPlans[0].plannedVisits[0].area, 'Banjara Hills');
});

test('calendar returns an empty tourPlans array, not an error, for a month with no MTP plan', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const res = await bdmAgent.get('/api/field-force/calendar?month=2026-08');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.tourPlans, []);
});

test('a manager sees their subtree BDM\'s MTP plan via calendar, but not an unrelated BDM\'s', async () => {
  const { asmAgent, bdm, bdmAgent } = await setupAsmBdm();
  const { asmAgent: otherAsmAgent, bdm: otherBdm, bdmAgent: otherBdmAgent } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Calendar C', area: 'Kondapur', assignedTo: String(bdm._id) });
  await otherAsmAgent.post('/api/doctors').send({ name: 'Dr. Calendar D', area: 'Madhapur', assignedTo: String(otherBdm._id) });
  await bdmAgent.post('/api/mtp').send({ month: '2026-08', plannedVisits: [{ area: 'Kondapur', date: '2026-08-05' }] });
  await otherBdmAgent.post('/api/mtp').send({ month: '2026-08', plannedVisits: [{ area: 'Madhapur', date: '2026-08-05' }] });

  const res = await asmAgent.get(`/api/field-force/calendar?month=2026-08&userId=${bdm._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.tourPlans.length, 1);
  assert.equal(res.body.data.tourPlans[0].plannedVisits[0].area, 'Kondapur');

  assert.equal((await asmAgent.get(`/api/field-force/calendar?month=2026-08&userId=${otherBdm._id}`)).status, 403);
});

test('calendar surfaces a real HRMS holiday (from the existing Holiday model/API) with its name, tenant-scoped', async () => {
  const { company, bdmAgent } = await setupAsmBdm();
  const { agent: adminAgent } = await authAgent(app, { company, email: 'holiday-admin@xyz.com', role: 'admin' });
  await adminAgent.post('/api/holidays').send({ date: '2026-08-15', name: 'Independence Day' });

  const res = await bdmAgent.get('/api/field-force/calendar?month=2026-08');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.holidays.length, 1);
  assert.equal(res.body.data.holidays[0].name, 'Independence Day');
  assert.equal(res.body.data.holidays[0].dateKey, '2026-08-15');
});

test('a holiday created in another company never appears in this company\'s calendar', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const companyB = await createCompany({ slug: 'calendar-holiday-cross-tenant' });
  const { agent: adminBAgent } = await authAgent(app, { company: companyB, email: 'holiday-admin-b@xyz.com', role: 'admin' });
  await adminBAgent.post('/api/holidays').send({ date: '2026-08-15', name: 'Company B Only Holiday' });

  const res = await bdmAgent.get('/api/field-force/calendar?month=2026-08');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.holidays.length, 0);
});

// ---------- Alerts ----------

test('the combined alerts feed includes both doctor and secondary-sale alerts', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const today = new Date();
  const soon = new Date(Date.UTC(1990, today.getUTCMonth(), today.getUTCDate()));
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Soon', assignedTo: String(bdm._id), dob: soon.toISOString() });
  await bdmAgent.post('/api/secondary-sales').send({ productName: 'Expiring Item', expiryDate: new Date(Date.now() + 2 * 86400000).toISOString() });

  const res = await bdmAgent.get('/api/field-force/alerts');
  assert.equal(res.status, 200);
  const sources = res.body.data.map((a) => a.source).sort();
  assert.deepEqual(sources, ['doctor', 'secondarySale']);
});

// ---------- Dashboard: live-computed, not hardcoded ----------

test('the dashboard reflects real submitted data, not fixed numbers', async () => {
  const { bdmAgent, asmAgent, asm, bdm } = await setupAsmBdm();
  const zero = await bdmAgent.get('/api/field-force/dashboard');
  assert.equal(zero.body.data.todaysCalls, 0);
  assert.equal(zero.body.data.mtpToursThisMonth, 0);

  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Dash', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctor.body.doctor._id });
  await bdmAgent.post('/api/expenses').send({ category: 'Food', date: new Date().toISOString(), amount: 100 });

  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const mtp = await bdmAgent.post('/api/mtp').send({ month });
  await bdmAgent.patch(`/api/mtp/${mtp.body.mtp._id}/submit`).send({ approverId: String(asm._id) });

  const res = await bdmAgent.get('/api/field-force/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.todaysCalls, 1);
  assert.equal(res.body.data.todaysExpenseTotal, 100);
  assert.equal(res.body.data.mtpToursThisMonth, 1);
  assert.equal(res.body.data.mtpPendingThisMonth, 1);

  // A second, independent tour in the same month must be counted too, without collapsing the two statuses.
  await bdmAgent.post('/api/mtp').send({ month });
  const withTwoTours = await bdmAgent.get('/api/field-force/dashboard');
  assert.equal(withTwoTours.body.data.mtpToursThisMonth, 2);
  assert.equal(withTwoTours.body.data.mtpPendingThisMonth, 1, 'the second tour is still a draft, not pending');
});

// ---------- Monitor: subtree vs company-wide, tenant isolation ----------

test('an ASM\'s monitor is scoped to their own subtree, not the whole company', async () => {
  const { asmAgent, bdmAgent, bdm } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Monitor', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctor.body.doctor._id });
  await otherBdmAgent.post('/api/expenses').send({ category: 'Food', date: new Date().toISOString(), amount: 50 });

  const res = await asmAgent.get('/api/field-force/monitor');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.teamSize, 1);
  assert.equal(res.body.data.dcrSubmittedTodayCount, 1);
  assert.equal(res.body.data.pendingExpenseCount, 0);
});

test('an admin in one company never sees another company\'s monitor data', async () => {
  const companyA = await createCompany({ slug: 'ffr-alpha' });
  const companyB = await createCompany({ slug: 'ffr-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', employeeDetails: { fieldRole: 'BDM' } });

  const res = await adminA.get('/api/field-force/monitor');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.teamSize, 0);
});

// ---------- Team performance: per-BDM breakdown, subtree scoping, tenant isolation ----------

test('a BDM cannot reach team-performance (ASM+ only)', async () => {
  const { bdmAgent } = await setupAsmBdm();
  assert.equal((await bdmAgent.get('/api/field-force/team-performance')).status, 403);
});

test('team-performance returns only the caller\'s own subtree BDMs, with real name/employeeId', async () => {
  const company = await getDefaultCompany();
  const { asmAgent, bdm, bdmAgent } = await setupAsmBdm();
  await createUser({
    companyId: company._id, employeeDetails: { fieldRole: 'BDM' },
    email: 'unrelated-perf-bdm@xyz.com'
  });
  const bdmDoc = await (await import('../models/User.js')).default.findById(bdm._id);
  bdmDoc.employeeDetails.employeeId = 'PERF-BDM-1';
  bdmDoc.personalDetails.firstName = 'Priya';
  bdmDoc.personalDetails.lastName = 'Desai';
  await bdmDoc.save();

  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Perf', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctor.body.doctor._id });

  const res = await asmAgent.get('/api/field-force/team-performance');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.totalBdms, 1, 'only the ASM\'s own BDM, never the unrelated one');
  const row = res.body.data[0];
  assert.equal(row.name, 'Priya Desai');
  assert.equal(row.employeeId, 'PERF-BDM-1');
  assert.ok(['top', 'active', 'review', 'low'].includes(row.status));
});

test('team-performance is company-wide for admin, and tenant-isolated', async () => {
  const companyA = await createCompany({ slug: 'perf-alpha' });
  const companyB = await createCompany({ slug: 'perf-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a-perf@xyz.com', role: 'admin' });
  await createUser({ companyId: companyA._id, email: 'bdm-a-perf@xyz.com', employeeDetails: { fieldRole: 'BDM' } });
  await createUser({ companyId: companyB._id, email: 'bdm-b-perf@xyz.com', employeeDetails: { fieldRole: 'BDM' } });

  const res = await adminA.get('/api/field-force/team-performance');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.totalBdms, 1, 'admin sees only their own company\'s BDMs');
});

// ---------- Team attendance: hierarchy scoping, punch status, tenant isolation ----------

test('a BDM cannot reach team-attendance (ASM+ only)', async () => {
  const { bdmAgent } = await setupAsmBdm();
  assert.equal((await bdmAgent.get('/api/field-force/team-attendance')).status, 403);
});

test('team-attendance (today) reports punched-in status correctly, scoped to the caller\'s own subtree', async () => {
  const company = await getDefaultCompany();
  const { asmAgent, asm, bdmAgent, bdm } = await setupAsmBdm();
  const { bdmAgent: unrelatedBdmAgent } = await setupAsmBdm();
  const secondBdm = await createUser({
    companyId: company._id, email: 'second-att-bdm@xyz.com',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id }
  });

  await bdmAgent.post('/api/attendance/punch-in');
  await unrelatedBdmAgent.post('/api/attendance/punch-in'); // must never appear in the ASM's results
  // secondBdm never punches in — stays "not in".

  const res = await asmAgent.get('/api/field-force/team-attendance?period=today');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.totalBdms, 2, 'only the ASM\'s own two subtree BDMs, never the unrelated one');
  assert.equal(res.body.summary.punchedIn, 1);
  assert.equal(res.body.summary.notIn, 1);

  const punchedInRow = res.body.rows.find((r) => String(r.userId) === String(bdm._id));
  assert.equal(punchedInRow.status, 'in');
  assert.ok(punchedInRow.punchInAt);

  const notInRow = res.body.rows.find((r) => String(r.userId) === String(secondBdm._id));
  assert.equal(notInRow.status, 'out');
});

test('team-attendance never includes a BDM outside the caller\'s reporting subtree, and admin sees company-wide', async () => {
  const companyA = await createCompany({ slug: 'att-alpha' });
  const companyB = await createCompany({ slug: 'att-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a-att@xyz.com', role: 'admin' });
  await createUser({ companyId: companyA._id, email: 'bdm-a-att@xyz.com', employeeDetails: { fieldRole: 'BDM' } });
  await createUser({ companyId: companyB._id, email: 'bdm-b-att@xyz.com', employeeDetails: { fieldRole: 'BDM' } });

  const res = await adminA.get('/api/field-force/team-attendance');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.totalBdms, 1, 'admin sees only their own company\'s BDMs');
});

test('team-attendance includes a fixed current-month monthlySummary regardless of the selected period', async () => {
  const { asmAgent, bdmAgent } = await setupAsmBdm();
  await bdmAgent.post('/api/attendance/punch-in');

  const res = await asmAgent.get('/api/field-force/team-attendance?period=month');
  assert.equal(res.status, 200);
  assert.equal(res.body.period, 'month');
  assert.ok(res.body.monthlySummary);
  assert.equal(res.body.monthlySummary.month, new Date().toISOString().slice(0, 7));
  assert.ok(res.body.monthlySummary.presentDaysAvg >= 0);
});
