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

/**
 * Builds a full 5-tier chain BDM → ASM → RSM → ZSM → NSM → Admin, plus a
 * same-ASM teammate BDM and an unrelated ASM/BDM pair — for exercising the
 * complete Joint Call participant eligibility surface (managers up the real
 * chain, same-team BDMs, and the negative cases: Admin, unrelated manager,
 * unrelated BDM, cross-tenant).
 */
const setupFullChainWithTeam = async () => {
  setupCounter += 1;
  const n = setupCounter;
  const company = await getDefaultCompany();
  const { agent: adminAgent, user: admin } = await authAgent(app, { company, email: `admin_${n}@xyz.com`, role: 'admin' });
  const nsm = await createUser({ companyId: company._id, email: `nsm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM' }, reportingManagerId: admin._id } });
  const zsm = await createUser({ companyId: company._id, email: `zsm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ZSM' }, reportingManagerId: nsm._id } });
  const rsm = await createUser({ companyId: company._id, email: `rsm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'RSM' }, reportingManagerId: zsm._id } });
  const asm = await createUser({
    companyId: company._id, email: `asm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id }
  });
  const bdm = await createUser({
    companyId: company._id, email: `bdm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const teammateBdm = await createUser({
    companyId: company._id, email: `teammate_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const bdmAgent = await loginAs(company, bdm);
  const asmAgent = await loginAs(company, asm);
  const doctorRes = await asmAgent.post('/api/doctors').send({ name: 'Dr. Chain', assignedTo: String(bdm._id) });
  return { company, admin, adminAgent, nsm, zsm, rsm, asm, asmAgent, bdm, bdmAgent, teammateBdm, doctorId: doctorRes.body.doctor._id };
};

test('an eligible RSM can be selected as Joint Call companion', async () => {
  const { bdmAgent, doctorId, rsm } = await setupFullChainWithTeam();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(rsm._id) });
  assert.equal(res.status, 201);
});

test('an eligible ZSM can be selected as Joint Call companion', async () => {
  const { bdmAgent, doctorId, zsm } = await setupFullChainWithTeam();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(zsm._id) });
  assert.equal(res.status, 201);
});

test('an eligible NSM can be selected as Joint Call companion', async () => {
  const { bdmAgent, doctorId, nsm } = await setupFullChainWithTeam();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(nsm._id) });
  assert.equal(res.status, 201);
});

test('Admin cannot be selected as a Joint Call manager companion, even though Admin sits above NSM in the raw chain', async () => {
  const { bdmAgent, doctorId, admin } = await setupFullChainWithTeam();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(admin._id) });
  assert.equal(res.status, 403);
});

test('a same-ASM teammate BDM can be selected as Joint Call companion', async () => {
  const { bdmAgent, doctorId, teammateBdm } = await setupFullChainWithTeam();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(teammateBdm._id) });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.dcr.accompaniedBy), String(teammateBdm._id));
});

test('a BDM from an unrelated ASM/team cannot be selected as Joint Call companion', async () => {
  const { bdmAgent, doctorId } = await setupFullChainWithTeam();
  const { bdm: unrelatedBdm } = await setupFullChainWithTeam();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(unrelatedBdm._id) });
  assert.equal(res.status, 403);
});

test('a cross-tenant participant is rejected as a Joint Call companion', async () => {
  const { bdmAgent, doctorId } = await setupFullChainWithTeam();
  const companyB = await createCompany({ slug: 'dcr-joint-cross-tenant' });
  const crossTenantAsm = await createUser({ companyId: companyB._id, email: 'cross-tenant-asm-joint@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(crossTenantAsm._id) });
  assert.equal(res.status, 403);
});

test('a Joint Call creates the correct DCR pending log with the eligible participant stored', async () => {
  const { bdmAgent, doctorId, asm } = await setupFullChainWithTeam();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId, accompaniedBy: String(asm._id) });
  assert.equal(res.status, 201);
  assert.equal(res.body.dcr.type, 'joint');
  assert.equal(res.body.dcr.status, 'pending');
  assert.equal(String(res.body.dcr.accompaniedBy), String(asm._id));
});

// ---------- Meeting is deliberately excluded from DCR ----------

test('type "meeting" is rejected by POST /api/dcr — Meeting is an internal Work Type activity only', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'meeting', doctorId, activityName: 'Team sync' });
  assert.equal(res.status, 400);
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

test('submitting a day only marks the caller\'s own entries for that date, once no call is still pending', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  assert.equal(created.body.dcr.submittedAt, null);
  assert.equal(created.body.dcr.status, 'pending');

  await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'completed' });

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

// ---------- Work Type → DCR: pending lifecycle, area derivation, duplicate protection ----------

test('a call created via the quick-log flow is born pending, with the doctor\'s real area available for display', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdmDoctor();
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Anil Joshi', speciality: 'Neurologist', area: 'Kukatpally', assignedTo: String(bdm._id) });

  const res = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctor.body.doctor._id, productsDetailed: ['Neurogain'] });
  assert.equal(res.status, 201);
  assert.equal(res.body.dcr.status, 'pending');
  assert.equal(res.body.dcr.doctorId.name, 'Dr. Anil Joshi');
  assert.equal(res.body.dcr.doctorId.area, 'Kukatpally');
  assert.deepEqual(res.body.dcr.productsDetailed, ['Neurogain']);
});

test('area is always the doctor\'s own Doctor.area — a client-supplied area field is simply ignored', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdmDoctor();
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Real Area', area: 'Real Area', assignedTo: String(bdm._id) });

  const res = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctor.body.doctor._id, area: 'Fake Injected Area' });
  assert.equal(res.status, 201);
  assert.equal(res.body.dcr.doctorId.area, 'Real Area');
});

test('a cross-tenant doctorId is rejected exactly like an unauthorized one', async () => {
  const companyB = await createCompany({ slug: 'dcr-cross-tenant' });
  const { agent: asmBAgent } = await authAgent(app, { company: companyB, email: 'asm-crosstenant@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const doctorB = await asmBAgent.post('/api/doctors').send({ name: 'Dr. OtherTenant' });

  const { bdmAgent } = await setupAsmBdmDoctor();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctorB.body.doctor._id });
  assert.equal(res.status, 404);
});

test('double-submitting the exact same call within the duplicate window returns the same DCR, not a second one', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const payload = { type: 'individual', doctorId, productsDetailed: ['Cardivax'] };

  const first = await bdmAgent.post('/api/dcr').send(payload);
  const second = await bdmAgent.post('/api/dcr').send(payload);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(String(first.body.dcr._id), String(second.body.dcr._id));

  const list = await bdmAgent.get('/api/dcr');
  assert.equal(list.body.data.length, 1, 'exactly one DCR row must exist, not two');
});

test('a legitimate second call to the same doctor on a different day is NOT blocked as a duplicate', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const first = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-10' });
  const second = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-11' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(String(first.body.dcr._id), String(second.body.dcr._id));

  const list = await bdmAgent.get('/api/dcr');
  assert.equal(list.body.data.length, 2, 'both legitimate calls on different days must exist');
});

// ---------- DCR completion: PATCH /api/dcr/:id ----------

test('a BDM can complete their own pending DCR with samples, product detail, feedback, and visit time', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });

  const res = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({
    productsDetailed: ['Neurogain', 'Cardivax'],
    samplesGiven: [{ product: 'Neurogain', quantity: 5 }, { product: 'Cardivax', quantity: 2 }],
    feedback: 'Interested in prescribing for new patients.',
    visitTime: '2026-08-12T11:30:00.000Z',
    status: 'completed'
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.dcr.status, 'completed');
  assert.deepEqual(res.body.dcr.productsDetailed, ['Neurogain', 'Cardivax']);
  assert.equal(res.body.dcr.samplesGiven.length, 2);
  assert.equal(res.body.dcr.samplesGiven[0].quantity, 5);
  assert.equal(res.body.dcr.feedback, 'Interested in prescribing for new patients.');
  assert.equal(new Date(res.body.dcr.visitTime).toISOString(), '2026-08-12T11:30:00.000Z');
});

test('a pending call can instead be marked missed via PATCH, with no samples/feedback required', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });

  const res = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'missed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.dcr.status, 'missed');
});

// ---------- Start/End Time (replaces single Visit Time for manual entry) ----------

test('a BDM can set startTime and endTime, and visitTime is mirrored to startTime for backward compatibility', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });

  const res = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({
    startTime: '2026-08-12T11:00:00.000Z',
    endTime: '2026-08-12T11:25:00.000Z',
    status: 'completed'
  });
  assert.equal(res.status, 200);
  assert.equal(new Date(res.body.dcr.startTime).toISOString(), '2026-08-12T11:00:00.000Z');
  assert.equal(new Date(res.body.dcr.endTime).toISOString(), '2026-08-12T11:25:00.000Z');
  assert.equal(new Date(res.body.dcr.visitTime).toISOString(), '2026-08-12T11:00:00.000Z', 'visitTime must mirror startTime so old sort/display code keeps working');
});

test('endTime must be strictly after startTime — equal or earlier is rejected', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });

  const equal = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({
    startTime: '2026-08-12T11:00:00.000Z', endTime: '2026-08-12T11:00:00.000Z'
  });
  assert.equal(equal.status, 400);

  const earlier = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({
    startTime: '2026-08-12T11:00:00.000Z', endTime: '2026-08-12T10:30:00.000Z'
  });
  assert.equal(earlier.status, 400);
});

test('endTime is validated against a previously-saved startTime even when only endTime is sent in this PATCH', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ startTime: '2026-08-12T11:00:00.000Z' });

  const res = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ endTime: '2026-08-12T10:00:00.000Z' });
  assert.equal(res.status, 400);
});

test('startTime/endTime persist and are readable after reload (a fresh GET)', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({
    startTime: '2026-08-12T09:00:00.000Z', endTime: '2026-08-12T09:15:00.000Z'
  });

  const list = await bdmAgent.get('/api/dcr');
  const row = list.body.data.find((d) => d._id === created.body.dcr._id);
  assert.equal(new Date(row.startTime).toISOString(), '2026-08-12T09:00:00.000Z');
  assert.equal(new Date(row.endTime).toISOString(), '2026-08-12T09:15:00.000Z');
});

test('marking a call missed does not require startTime/endTime', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });

  const res = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'missed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.dcr.status, 'missed');
  assert.equal(res.body.dcr.startTime, null);
  assert.equal(res.body.dcr.endTime, null);
});

test('an old record with only visitTime (no startTime/endTime) still works — other fields can be edited without supplying either', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  // Simulates a pre-existing record: startTime/endTime were never set (only
  // the legacy visitTime, which POST /api/dcr always sets).
  assert.equal(created.body.dcr.startTime, null);
  assert.equal(created.body.dcr.endTime, null);
  assert.ok(created.body.dcr.visitTime);

  const res = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ feedback: 'Editing an old-style record.' });
  assert.equal(res.status, 200);
  assert.equal(res.body.dcr.feedback, 'Editing an old-style record.');
  assert.equal(res.body.dcr.startTime, null);
  assert.equal(res.body.dcr.endTime, null);
});

test('a BDM cannot PATCH another BDM\'s DCR', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  const { bdmAgent: otherBdmAgent } = await setupAsmBdmDoctor();

  const res = await otherBdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'completed' });
  assert.equal(res.status, 403);
});

test('a DCR belonging to an already-submitted day cannot be edited', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });

  const res = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ feedback: 'too late' });
  assert.equal(res.status, 400);
});

// ---------- End-of-day submission rules ----------

test('submitting a day with a still-pending call is rejected, and never silently completes or discards it', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });

  const res = await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });
  assert.equal(res.status, 400);
  assert.equal(res.body.details?.pendingCount, 1);

  const list = await bdmAgent.get('/api/dcr?date=2026-08-12');
  assert.equal(list.body.data[0].status, 'pending', 'the pending call must be untouched, not auto-completed or removed');
});

test('mark-remaining-missed lets the BDM clear pending calls, then submit succeeds', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });

  const marked = await bdmAgent.patch('/api/dcr/mark-remaining-missed').send({ date: '2026-08-12' });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.modifiedCount, 1);

  const submitted = await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });
  assert.equal(submitted.status, 200);

  const list = await bdmAgent.get('/api/dcr?date=2026-08-12');
  assert.equal(list.body.data[0].status, 'missed');
  assert.ok(list.body.data[0].submittedAt);
});

// ---------- Category / status filters on GET /api/dcr ----------

test('GET /api/dcr with no filter (category=All) returns every category', async () => {
  const { bdmAgent, asmAgent, bdm, asm, doctorId } = await setupAsmBdmDoctor();
  const doctor2 = await asmAgent.post('/api/doctors').send({ name: 'Dr. Two', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId: doctor2.body.doctor._id, accompaniedBy: String(asm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'missed', doctorId: doctor2.body.doctor._id });

  const res = await bdmAgent.get('/api/dcr');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 3);
});

test('type=individual returns only individual calls', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdmDoctor();
  const d1 = await asmAgent.post('/api/doctors').send({ name: 'Dr. A', assignedTo: String(bdm._id) });
  const d2 = await asmAgent.post('/api/doctors').send({ name: 'Dr. B', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: d1.body.doctor._id });
  await bdmAgent.post('/api/dcr').send({ type: 'missed', doctorId: d2.body.doctor._id });

  const res = await bdmAgent.get('/api/dcr?type=individual');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].type, 'individual');
});

test('type=joint returns only joint calls', async () => {
  const { bdmAgent, asmAgent, bdm, asm } = await setupAsmBdmDoctor();
  const d1 = await asmAgent.post('/api/doctors').send({ name: 'Dr. A', assignedTo: String(bdm._id) });
  const d2 = await asmAgent.post('/api/doctors').send({ name: 'Dr. B', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: d1.body.doctor._id });
  await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId: d2.body.doctor._id, accompaniedBy: String(asm._id) });

  const res = await bdmAgent.get('/api/dcr?type=joint');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].type, 'joint');
});

test('status=pending / completed / missed each return only that status', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const a = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  const b = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-13' });
  await bdmAgent.patch(`/api/dcr/${a.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch(`/api/dcr/${b.body.dcr._id}`).send({ status: 'missed' });

  const pending = await bdmAgent.get('/api/dcr?status=pending');
  assert.equal(pending.body.data.length, 0);
  const completed = await bdmAgent.get('/api/dcr?status=completed');
  assert.equal(completed.body.data.length, 1);
  assert.equal(completed.body.data[0].status, 'completed');
  const missed = await bdmAgent.get('/api/dcr?status=missed');
  assert.equal(missed.body.data.length, 1);
  assert.equal(missed.body.data[0].status, 'missed');
});

test('category and status filters combine (e.g. individual + pending)', async () => {
  const { bdmAgent, asmAgent, bdm, asm, doctorId } = await setupAsmBdmDoctor();
  const jointDoctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Joint', assignedTo: String(bdm._id) });
  const pendingIndividual = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-14' });
  const completedIndividual = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-15' });
  await bdmAgent.patch(`/api/dcr/${completedIndividual.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId: jointDoctor.body.doctor._id, accompaniedBy: String(asm._id), date: '2026-08-14' });

  const res = await bdmAgent.get('/api/dcr?type=individual&status=pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(String(res.body.data[0]._id), String(pendingIndividual.body.dcr._id));
});

// ---------- Mark-remaining-missed safety boundaries ----------

test('mark-remaining-missed leaves completed and already-missed calls untouched', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const pending = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  const completed = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-13' });
  await bdmAgent.patch(`/api/dcr/${completed.body.dcr._id}`).send({ status: 'completed' });
  const missed = await bdmAgent.post('/api/dcr').send({ type: 'missed', doctorId, date: '2026-08-14' });

  const res = await bdmAgent.patch('/api/dcr/mark-remaining-missed').send({ date: '2026-08-12' });
  assert.equal(res.body.modifiedCount, 1);

  const list = await bdmAgent.get('/api/dcr?date=2026-08-12');
  assert.equal(list.body.data[0].status, 'missed');
  const completedCheck = await bdmAgent.get('/api/dcr?date=2026-08-13');
  assert.equal(completedCheck.body.data[0].status, 'completed');
  const missedCheck = await bdmAgent.get('/api/dcr?date=2026-08-14');
  assert.equal(missedCheck.body.data[0].status, 'missed');
  void pending; void missed;
});

test('mark-remaining-missed never touches another BDM\'s pending calls', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const { bdmAgent: otherBdmAgent, doctorId: otherDoctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  await otherBdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: otherDoctorId, date: '2026-08-12' });

  await bdmAgent.patch('/api/dcr/mark-remaining-missed').send({ date: '2026-08-12' });

  const otherList = await otherBdmAgent.get('/api/dcr?date=2026-08-12');
  assert.equal(otherList.body.data[0].status, 'pending', 'another BDM\'s pending call must be untouched');
});

test('mark-remaining-missed cannot touch a day already submitted (nothing left to mark, no error)', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });

  const res = await bdmAgent.patch('/api/dcr/mark-remaining-missed').send({ date: '2026-08-12' });
  assert.equal(res.status, 200);
  assert.equal(res.body.modifiedCount, 0, 'no pending rows remain, so nothing is modified');

  const list = await bdmAgent.get('/api/dcr?date=2026-08-12');
  assert.equal(list.body.data[0].status, 'completed', 'the already-completed, submitted row must be untouched');
});

test('repeating mark-remaining-missed is safe/idempotent', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });

  const first = await bdmAgent.patch('/api/dcr/mark-remaining-missed').send({ date: '2026-08-12' });
  assert.equal(first.body.modifiedCount, 1);
  const second = await bdmAgent.patch('/api/dcr/mark-remaining-missed').send({ date: '2026-08-12' });
  assert.equal(second.body.modifiedCount, 0);
});

// ---------- Filter state must never affect what gets submitted ----------

test('submit-day submits every unsubmitted entry for the date regardless of any client-side filter', async () => {
  const { bdmAgent, asmAgent, bdm, asm, doctorId } = await setupAsmBdmDoctor();
  const jointDoctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Joint2', assignedTo: String(bdm._id) });
  const individual = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  const joint = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId: jointDoctor.body.doctor._id, accompaniedBy: String(asm._id), date: '2026-08-12' });
  await bdmAgent.patch(`/api/dcr/${individual.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch(`/api/dcr/${joint.body.dcr._id}`).send({ status: 'completed' });

  const res = await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });
  assert.equal(res.body.modifiedCount, 2, 'submission is never limited to a subset by category/type');
});

test('a submitted/locked record cannot be re-modified by mark-remaining-missed or PATCH', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });

  const patchRes = await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'missed' });
  assert.equal(patchRes.status, 400);
});

// ---------- Camp activities become real DCR rows (Meeting deliberately does not) ----------

test('a camp activity is logged as a DCR row, born pending like other categories, with no doctor', async () => {
  const { bdmAgent } = await setupAsmBdmDoctor();
  const res = await bdmAgent.post('/api/dcr').send({ type: 'camp', activityName: 'Diabetes CME camp', venue: 'Community Hall' });
  assert.equal(res.status, 201);
  assert.equal(res.body.dcr.type, 'camp');
  assert.equal(res.body.dcr.status, 'pending');
  assert.equal(res.body.dcr.doctorId, null);
  assert.equal(res.body.dcr.activityName, 'Diabetes CME camp');
});

test('type=camp filter returns only camp activities', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  await bdmAgent.post('/api/dcr').send({ type: 'camp', activityName: 'Camp A' });

  const camp = await bdmAgent.get('/api/dcr?type=camp');
  assert.equal(camp.body.data.length, 1);
  assert.equal(camp.body.data[0].activityName, 'Camp A');
});

// ---------- One Daily DCR per BDM+date: a legitimate new log after submission ----------

test('BDM+date scenario: 3 logs, submit, then a legitimate 4th log after submission joins the SAME day — never a second report', async () => {
  const { bdmAgent, asmAgent, bdm, asm } = await setupAsmBdmDoctor();
  const anil = await asmAgent.post('/api/doctors').send({ name: 'Dr. Anil', assignedTo: String(bdm._id) });
  const rekha = await asmAgent.post('/api/doctors').send({ name: 'Dr. Rekha', assignedTo: String(bdm._id) });
  const vikram = await asmAgent.post('/api/doctors').send({ name: 'Dr. Vikram', assignedTo: String(bdm._id) });
  const date = '2026-09-15';

  const call1 = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: anil.body.doctor._id, date });
  const call2 = await bdmAgent.post('/api/dcr').send({ type: 'joint', doctorId: rekha.body.doctor._id, accompaniedBy: String(asm._id), date });
  const call3 = await bdmAgent.post('/api/dcr').send({ type: 'camp', activityName: 'Team camp', date });
  assert.equal(call3.body.dcr.status, 'pending', 'a camp is born pending, same as any other category');
  await bdmAgent.patch(`/api/dcr/${call1.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch(`/api/dcr/${call2.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch(`/api/dcr/${call3.body.dcr._id}`).send({ status: 'completed' });

  // 3 logs exist for the day before first submission.
  const before = await bdmAgent.get(`/api/dcr?date=${date}`);
  assert.equal(before.body.data.length, 3);

  const submit1 = await bdmAgent.patch('/api/dcr/submit-day').send({ date });
  assert.equal(submit1.status, 200);
  assert.equal(submit1.body.modifiedCount, 3);

  const afterSubmit1 = await bdmAgent.get(`/api/dcr?date=${date}`);
  assert.ok(afterSubmit1.body.data.every((d) => d.submittedAt), 'every row must be submitted');
  const oldSubmittedAt = Object.fromEntries(afterSubmit1.body.data.map((d) => [d._id, d.submittedAt]));

  // A legitimate new activity logged AFTER submission must succeed and join the same date.
  const call4 = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: vikram.body.doctor._id, date });
  assert.equal(call4.status, 201, 'logging a new activity after submission must succeed, not be blocked');
  assert.equal(call4.body.dcr.dateKey, date);
  assert.equal(call4.body.dcr.status, 'pending');

  // Still exactly 4 rows for this BDM+date — no second "daily report" was created.
  const afterNewLog = await bdmAgent.get(`/api/dcr?date=${date}`);
  assert.equal(afterNewLog.body.data.length, 4, 'the new log must join the same daily report, not start a second one');

  // The report now "needs resubmission": a mix of submitted and unsubmitted rows for the same date.
  const submittedCount = afterNewLog.body.data.filter((d) => d.submittedAt).length;
  assert.equal(submittedCount, 3, 'the 3 original logs remain submitted');
  const newRow = afterNewLog.body.data.find((d) => String(d._id) === String(call4.body.dcr._id));
  assert.equal(newRow.submittedAt, null, 'the new log is not yet submitted — this mix IS "needs resubmission"');

  // Existing logs must be completely unchanged by adding the new one.
  for (const d of afterNewLog.body.data) {
    if (d._id !== String(call4.body.dcr._id)) {
      assert.equal(d.submittedAt, oldSubmittedAt[d._id], 'previously-submitted rows must keep their own submission metadata untouched');
    }
  }

  // Resubmission is blocked until the new pending log is handled — never silently dropped or auto-completed.
  const blockedResubmit = await bdmAgent.patch('/api/dcr/submit-day').send({ date });
  assert.equal(blockedResubmit.status, 400);

  // Complete the new log, then resubmit — the SAME daily report, not a new one.
  await bdmAgent.patch(`/api/dcr/${call4.body.dcr._id}`).send({ status: 'completed' });
  const submit2 = await bdmAgent.patch('/api/dcr/submit-day').send({ date });
  assert.equal(submit2.status, 200);
  assert.equal(submit2.body.modifiedCount, 1, 'only the newly-added row needed submitting');

  const final = await bdmAgent.get(`/api/dcr?date=${date}`);
  assert.equal(final.body.data.length, 4, 'still exactly one logical daily report of 4 rows — never a duplicate');
  assert.ok(final.body.data.every((d) => d.submittedAt), 'the complete, current list of logs is now submitted');

  // The manager sees the one complete report for this BDM+date, not four unrelated submissions.
  const teamView = await asmAgent.get(`/api/dcr/team?date=${date}`);
  assert.equal(teamView.body.data.length, 4);
});

test('adding a new log after submission never lets it belong to another BDM or tenant', async () => {
  const { bdmAgent, doctorId } = await setupAsmBdmDoctor();
  const { bdmAgent: otherBdmAgent, doctorId: otherDoctorId } = await setupAsmBdmDoctor();
  const date = '2026-09-16';

  const call = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date });
  await bdmAgent.patch(`/api/dcr/${call.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch('/api/dcr/submit-day').send({ date });

  await otherBdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: otherDoctorId, date });

  const bdmList = await bdmAgent.get(`/api/dcr?date=${date}`);
  assert.equal(bdmList.body.data.length, 1, 'the other BDM\'s new log must never appear in this BDM\'s daily report');
});

test('a submitted DCR is visible to the reporting ASM via /team, correctly scoped to that BDM only', async () => {
  const { bdmAgent, asmAgent, doctorId } = await setupAsmBdmDoctor();
  const created = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: '2026-08-12' });
  await bdmAgent.patch(`/api/dcr/${created.body.dcr._id}`).send({ status: 'completed' });
  await bdmAgent.patch('/api/dcr/submit-day').send({ date: '2026-08-12' });

  const res = await asmAgent.get('/api/dcr/team?date=2026-08-12');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].status, 'completed');
  assert.ok(res.body.data[0].submittedAt);
});

// ---------- Manager DCR Review: today/week/month period filtering + full hierarchy scoping ----------

const daysAgoISO = (n) => {
  const d = new Date();
  d.setUTCHours(9, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
};

test('period=today (the default) only returns today\'s calls via /team, not yesterday\'s', async () => {
  const { bdmAgent, asmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(1) });

  const res = await asmAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('period=week returns this week\'s calls but not one from last week', async () => {
  const { bdmAgent, asmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(9) });

  const res = await asmAgent.get('/api/dcr/team?period=week');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1, 'only the call within the current Mon-Sun week should be included');
});

test('period=month returns this month\'s calls but not one from 2 months ago', async () => {
  const { bdmAgent, asmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(65) });

  const res = await asmAgent.get('/api/dcr/team?period=month');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('an explicit ?date= still takes precedence over period, unaffected by today\'s default', async () => {
  const { bdmAgent, asmAgent, doctorId } = await setupAsmBdmDoctor();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(3) });

  const res = await asmAgent.get(`/api/dcr/team?date=${daysAgoISO(3).slice(0, 10)}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('an RSM sees their whole downstream subtree\'s calls (ZSM has no direct reports here, ASM+BDM do) via /team', async () => {
  const { company, rsm, bdmAgent, doctorId } = await setupFullChainWithTeam();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });
  const rsmAgent = await loginAs(company, rsm);

  const res = await rsmAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('a ZSM sees their whole downstream subtree\'s calls via /team', async () => {
  const { company, zsm, bdmAgent, doctorId } = await setupFullChainWithTeam();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });
  const zsmAgent = await loginAs(company, zsm);

  const res = await zsmAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('an NSM sees their whole downstream subtree\'s calls via /team', async () => {
  const { company, nsm, bdmAgent, doctorId } = await setupFullChainWithTeam();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });
  const nsmAgent = await loginAs(company, nsm);

  const res = await nsmAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test('an RSM never sees calls from a BDM outside their own downstream subtree', async () => {
  const { company, rsm } = await setupFullChainWithTeam();
  const { bdmAgent: unrelatedBdmAgent, doctorId: unrelatedDoctorId } = await setupFullChainWithTeam();
  await unrelatedBdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: unrelatedDoctorId, date: daysAgoISO(0) });
  const rsmAgent = await loginAs(company, rsm);

  const res = await rsmAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});

test('admin sees company-wide calls via /team, correctly excluding another tenant\'s', async () => {
  const { admin, adminAgent, bdmAgent, doctorId } = await setupFullChainWithTeam();
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });

  const companyB = await createCompany({ slug: 'dcr-review-admin-cross-tenant' });
  const asmB = await createUser({ companyId: companyB._id, email: 'asmb-review@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdmB = await createUser({
    companyId: companyB._id, email: 'bdmb-review@xyz.com', password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asmB._id }
  });
  const bdmBAgent = await loginAs(companyB, bdmB);
  const asmBAgent = await loginAs(companyB, asmB);
  const doctorB = await asmBAgent.post('/api/doctors').send({ name: 'Dr. Beta Review', assignedTo: String(bdmB._id) });
  await bdmBAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctorB.body.doctor._id, date: daysAgoISO(0) });

  assert.ok(admin); // sanity: admin resolved from the correct tenant's chain
  const res = await adminAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1, 'admin must see only their own company\'s calls, never companyB\'s');
});

test('/team response carries the submitting BDM\'s name and Employee ID for the review list/detail UI', async () => {
  const { bdm, bdmAgent, asmAgent, doctorId } = await setupAsmBdmDoctor();
  await User.updateOne({ _id: bdm._id }, { $set: { 'employeeDetails.employeeId': 'BDM-REVIEW-01' } });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId, date: daysAgoISO(0) });

  const res = await asmAgent.get('/api/dcr/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data[0].userId.employeeDetails.employeeId, 'BDM-REVIEW-01');
  assert.equal(res.body.data[0].userId.personalDetails.firstName, 'Test');
});
