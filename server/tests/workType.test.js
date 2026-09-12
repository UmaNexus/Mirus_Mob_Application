import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';
import LeaveRequest from '../models/LeaveRequest.js';

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

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/work-type')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/work-type')).status, 403);
});

// ---------- Type set validity per tier ----------

test('a BDM can log an individual-call work type', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'individual', details: { area: 'Pune Central' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.workType.type, 'individual');
});

test('a BDM cannot log the manager-only "fieldcall" work type', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'fieldcall' });
  assert.equal(res.status, 400);
});

test('an ASM cannot log the BDM-only "individual" work type but can log "fieldcall"', async () => {
  const { asmAgent } = await setupAsmBdm();
  const blocked = await asmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'individual' });
  assert.equal(blocked.status, 400);

  const allowed = await asmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'fieldcall' });
  assert.equal(allowed.status, 200);
});

// ---------- Sick/leave routes into the existing Leave module ----------

test('selecting "sick" creates a real LeaveRequest instead of storing leave data on WorkType', async () => {
  const { bdmAgent, bdm } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/work-type').send({
    date: '2026-08-12', type: 'sick',
    details: { leaveType: 'Sick', fromDate: '2026-08-12', toDate: '2026-08-13', reason: 'Fever' }
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.workType.linkedLeaveRequestId);

  const leave = await LeaveRequest.findById(res.body.workType.linkedLeaveRequestId);
  assert.ok(leave);
  assert.equal(String(leave.userId), String(bdm._id));
  assert.equal(leave.type, 'Sick');
  assert.equal(leave.days, 2);
});

test('an invalid leaveType (not in the existing Leave enum) is rejected — no invented leave types', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/work-type').send({
    date: '2026-08-12', type: 'leave',
    details: { leaveType: 'CL', fromDate: '2026-08-18', toDate: '2026-08-19' }
  });
  assert.equal(res.status, 400);
});

// ---------- Joint work type: accompaniedBy validated against reporting chain ----------

test('a BDM can log a joint work type with their own reporting manager', async () => {
  const { bdmAgent, asm } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'joint', details: { accompaniedBy: String(asm._id) } });
  assert.equal(res.status, 200);
});

test('a BDM cannot claim an unrelated manager accompanied them', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const company = await getDefaultCompany();
  const unrelated = await createUser({ companyId: company._id, email: 'unrelated-mgr@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'joint', details: { accompaniedBy: String(unrelated._id) } });
  assert.equal(res.status, 403);
});

// ---------- Upsert semantics ----------

test('posting a second work type for the same day updates it, not duplicates it', async () => {
  const { bdmAgent } = await setupAsmBdm();
  await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'individual' });
  const second = await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'camp', details: { campName: 'CME Camp' } });
  assert.equal(second.status, 200);

  const list = await bdmAgent.get('/api/work-type?date=2026-08-12');
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].type, 'camp');
});

// ---------- Visibility / tenant isolation ----------

test('an ASM sees their subtree BDM\'s work type via /team but not an unrelated BDM\'s', async () => {
  const { asmAgent, bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'individual' });
  await otherBdmAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'individual' });

  const res = await asmAgent.get('/api/work-type/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('an admin in one company never sees work-type entries from another company', async () => {
  const companyA = await createCompany({ slug: 'wt-alpha' });
  const companyB = await createCompany({ slug: 'wt-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const bdmB = await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const bdmBAgent = await loginAs(companyB, bdmB);
  await bdmBAgent.post('/api/work-type').send({ date: '2026-08-12', type: 'individual' });

  const res = await adminA.get('/api/work-type/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
