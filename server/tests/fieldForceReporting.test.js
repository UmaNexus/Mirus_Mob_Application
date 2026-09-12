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
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: `asm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: `bdm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
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

test('an employee with no fieldForce tier is denied all reporting endpoints', async () => {
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
  const { agent } = await authAgent(app, { email: 'orphan@xyz.com', employeeDetails: { fieldForce: { tier: 'NSM' } } });
  const res = await agent.get('/api/field-force/my-chain');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
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
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const zero = await bdmAgent.get('/api/field-force/dashboard');
  assert.equal(zero.body.data.todaysCalls, 0);
  assert.equal(zero.body.data.mtpStatus, null);

  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Dash', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctor.body.doctor._id });
  await bdmAgent.post('/api/expenses').send({ category: 'Food', date: new Date().toISOString(), amount: 100 });

  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const mtp = await bdmAgent.post('/api/mtp').send({ month });
  await bdmAgent.patch(`/api/mtp/${mtp.body.mtp._id}/submit`).send({});

  const res = await bdmAgent.get('/api/field-force/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.todaysCalls, 1);
  assert.equal(res.body.data.todaysExpenseTotal, 100);
  assert.equal(res.body.data.mtpStatus, 'pending');
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
  await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });

  const res = await adminA.get('/api/field-force/monitor');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.teamSize, 0);
});
