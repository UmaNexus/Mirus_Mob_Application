import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';
import User from '../models/User.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

/** Log in as an existing user directly (bypasses authAgent's own user-creation). */
const loginAs = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return agent;
};

let setupCounter = 0;
/** Sets up an ASM + a BDM reporting to them, with one doctor assigned to the BDM. */
const setupAsmBdmDoctor = async () => {
  setupCounter += 1;
  const n = setupCounter;
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: `asm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: `bdm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const bdmAgent = await loginAs(company, bdm);
  const doctorRes = await asmAgent.post('/api/doctors').send({ name: 'Dr. Field', assignedTo: String(bdm._id) });
  return { company, asmAgent, asm, bdm, bdmAgent, doctorId: doctorRes.body.doctor._id };
};

// ---------- Authentication / tier gating ----------

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/dcr')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/dcr')).status, 403);
  assert.equal((await agent.post('/api/dcr').send({ type: 'individual', doctorId: '000000000000000000000000' })).status, 403);
});

test('a BDM cannot reach the ASM+ team endpoint', async () => {
  const { bdmAgent } = await setupAsmBdmDoctor();
  assert.equal((await bdmAgent.get('/api/dcr/team')).status, 403);
});

// ---------- Ownership: doctor must be assigned to the caller ----------

test('a BDM can log an individual call for a doctor assigned to them', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, productsDetailed: ['Cardivax'] });
  assert.equal(res.status, 201);
  assert.equal(res.body.dcr.type, 'individual');
});

test('a BDM cannot log a call for a doctor not assigned to them', async () => {
  const company = await getDefaultCompany();
  const { asmAgent } = await setupAsmBdmDoctor();
  const otherDoctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. NotMine' }); // unassigned
  const { bdmAgent } = await setupAsmBdmDoctor();

  const res = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: otherDoctor.body.doctor._id });
  assert.equal(res.status, 404);
});

// ---------- Joint call: accompaniedBy must be in the BDM's own reporting chain ----------

test('a BDM can log a joint call with their own reporting manager', async () => {
  const { bdmAgent, doctorId, asm } = await setupAsmBdmDoctor();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(asm._id) });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.dcr.accompaniedBy), String(asm._id));
});

test('a BDM cannot log a joint call claiming an unrelated manager accompanied them', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const company = await getDefaultCompany();
  const unrelatedManager = await createUser({ companyId: company._id, email: 'unrelated-mgr@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });

  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(unrelatedManager._id) });
  assert.equal(res.status, 403);
});

// ---------- Visibility scoping ----------

test('a BDM sees only their own DCR entries', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const { bdmAgent: otherBdmAgent, doctorId: otherDoctorId } = await setupAsmBdmDoctor();

  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  await otherBdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: otherDoctorId });

  const res = await bdmAgent.get('/api/dcr');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('an ASM sees their subtree BDM\'s calls via /team but not an unrelated BDM\'s', async () => {
  const { asmAgent, bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const { bdmAgent: unrelatedBdmAgent, doctorId: unrelatedDoctorId } = await setupAsmBdmDoctor();

  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  await unrelatedBdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: unrelatedDoctorId });

  const res = await asmAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

// ---------- Submit day ----------

test('submitting a day only marks the caller\'s own entries for that date', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  assert.equal(created.body.dcr.submittedAt, null);

  const res = await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });
  assert.equal(res.status, 200);
  assert.equal(res.body.modifiedCount, 1);

  const list = await bdmAgent.get('/api/dcr?date=2026-08-12');
  assert.ok(list.body.data[0].submittedAt);
});

// ---------- Tenant isolation ----------

test('an admin in one company never sees DCR entries from another company', async () => {
  const companyA = await createCompany({ slug: 'dcr-alpha' });
  const companyB = await createCompany({ slug: 'dcr-beta' });

  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const { agent: asmBAgent } = await authAgent(app, { company: companyB, email: 'asm-b@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const asmB = await User.findOne({ email: 'asm-b@xyz.com' });
  const bdmB = await createUser({
    companyId: companyB._id, email: 'bdm-b@xyz.com', password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asmB._id }
  });
  const bdmBAgent = await loginAs(companyB, bdmB);
  const doctorB = await asmBAgent.post('/api/doctors').send({ name: 'Dr. Beta', assignedTo: String(bdmB._id) });
  await bdmBAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctorB.body.doctor._id });

  const res = await adminA.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
