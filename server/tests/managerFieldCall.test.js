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

// ---------- Authentication / tier gating ----------

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/manager-field-calls')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/manager-field-calls')).status, 403);
});

test('a BDM (below the ASM+ floor) cannot log a manager field call', async () => {
  const { agent } = await authAgent(app, { email: 'bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const res = await agent.post('/api/manager-field-calls').send({ visitType: 'Doctor', reason: 'No BDM assigned', contactName: 'Dr. Adhoc' });
  assert.equal(res.status, 403);
});

// ---------- Creation ----------

test('an ASM can log a field call for an ad-hoc contact (no doctorId)', async () => {
  const { agent } = await authAgent(app, { email: 'asm1@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await agent.post('/api/manager-field-calls').send({
    visitType: 'Doctor', reason: 'No BDM assigned', contactName: 'Dr. Adhoc', area: 'Nashik East'
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.call.tier, 'ASM');
});

test('validation rejects a call with neither doctorId nor contactName', async () => {
  const { agent } = await authAgent(app, { email: 'asm2@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await agent.post('/api/manager-field-calls').send({ visitType: 'Doctor', reason: 'Emergency visit' });
  assert.equal(res.status, 400);
});

test('an ASM can log a field call for a doctor assigned to their own BDM', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm3@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({ companyId: company._id, email: 'bdm3@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id } });
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Owned', assignedTo: String(bdm._id) });

  const res = await asmAgent.post('/api/manager-field-calls').send({ visitType: 'Doctor', reason: 'BDM on leave', doctorId: doctor.body.doctor._id });
  assert.equal(res.status, 201);
});

test('an ASM cannot log a field call for a doctor outside their reporting scope', async () => {
  const company = await getDefaultCompany();
  const { agent: otherAsmAgent, user: otherAsm } = await authAgent(app, { email: 'other-asm@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const foreignBdm = await createUser({ companyId: company._id, email: 'foreign-bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: otherAsm._id } });
  const doctor = await otherAsmAgent.post('/api/doctors').send({ name: 'Dr. Foreign', assignedTo: String(foreignBdm._id) });

  const { agent: asmAgent } = await authAgent(app, { email: 'asm4@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await asmAgent.post('/api/manager-field-calls').send({ visitType: 'Doctor', reason: 'BDM vacancy', doctorId: doctor.body.doctor._id });
  assert.equal(res.status, 403);
});

// ---------- Visibility ----------

test('an RSM sees an ASM reporting to them via /team, but not an unrelated ASM\'s calls', async () => {
  const company = await getDefaultCompany();
  const { agent: rsmAgent, user: rsm } = await authAgent(app, { email: 'rsm1@xyz.com', employeeDetails: { fieldForce: { tier: 'RSM' } } });
  const asm = await createUser({
    companyId: company._id, email: 'asm5@xyz.com', password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id }
  });
  const asmAgent = await loginAs(company, asm);
  await asmAgent.post('/api/manager-field-calls').send({ visitType: 'Chemist', reason: 'Emergency visit', contactName: 'Apollo Pharmacy' });

  const { agent: unrelatedAsmAgent } = await authAgent(app, { email: 'asm6@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  await unrelatedAsmAgent.post('/api/manager-field-calls').send({ visitType: 'Chemist', reason: 'Emergency visit', contactName: 'Other Pharmacy' });

  const res = await rsmAgent.get('/api/manager-field-calls/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].contactName, 'Apollo Pharmacy');
});

// ---------- Tenant isolation ----------

test('an admin in one company never sees manager field calls from another company', async () => {
  const companyA = await createCompany({ slug: 'mfc-alpha' });
  const companyB = await createCompany({ slug: 'mfc-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const asmB = await createUser({ companyId: companyB._id, email: 'asm-b@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const asmBAgent = await loginAs(companyB, asmB);
  await asmBAgent.post('/api/manager-field-calls').send({ visitType: 'Doctor', reason: 'No BDM assigned', contactName: 'Dr. Beta' });

  const res = await adminA.get('/api/manager-field-calls/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
