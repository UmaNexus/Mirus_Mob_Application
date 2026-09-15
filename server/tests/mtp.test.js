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
/** ASM + a BDM reporting to them. */
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
  assert.equal((await request(app).get('/api/mtp')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/mtp')).status, 403);
  assert.equal((await agent.post('/api/mtp').send({ month: '2026-08' })).status, 403);
});

// ---------- Create / submit ----------

test('a BDM can create a draft MTP and submit it — approver is auto-computed from reportingManagerId', async () => {
  const { bdmAgent, asm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  assert.equal(created.status, 201);
  assert.equal(created.body.mtp.status, 'draft');
  assert.equal(created.body.mtp.approverId, null);

  const submitted = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.mtp.status, 'pending');
  assert.equal(String(submitted.body.mtp.approverId), String(asm._id));
});

test('the mobile client cannot choose an approver — only reportingManagerId is ever used', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const company = await getDefaultCompany();
  const arbitraryManager = await createUser({ companyId: company._id, email: 'arbitrary-mgr@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });

  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-09' });
  // Even if a client tried to smuggle an approverId, submit ignores req.body
  // entirely for that field — it is never read from the request.
  const submitted = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(arbitraryManager._id) });
  assert.equal(submitted.status, 200);
  assert.notEqual(String(submitted.body.mtp.approverId), String(arbitraryManager._id));
});

test('a BDM with no reporting manager cannot submit', async () => {
  const { agent } = await authAgent(app, { email: 'orphan-bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const created = await agent.post('/api/mtp').send({ month: '2026-08' });
  const res = await agent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});
  assert.equal(res.status, 400);
});

// ---------- Approval: only the designated approver ----------

test('only the exact designated approver can decide a pending MTP, not another ASM', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const { asmAgent: unrelatedAsmAgent } = await setupAsmBdm();

  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});

  const blocked = await unrelatedAsmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(blocked.status, 403);

  const allowed = await asmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.mtp.status, 'approved');
});

test('a rejected tour can be resubmitted via PATCH; a pending tour cannot be edited directly', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});
  await asmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'rejected', note: 'Too many visits' });

  // PATCH on the rejected tour resets it to draft — this IS the resubmission
  // path, not a direct field edit bypassing the lifecycle.
  const edited = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}`).send({ remarks: 'Revised plan' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.mtp.status, 'draft');

  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});
  const blocked = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}`).send({ remarks: 'Sneaky edit while pending' });
  assert.equal(blocked.status, 400);
});

test('a BDM cannot PATCH another BDM\'s tour', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();
  const created = await otherBdmAgent.post('/api/mtp').send({ month: '2026-08' });

  const res = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}`).send({ remarks: 'hijack' });
  assert.equal(res.status, 403);
});

// ---------- Withdraw ----------

test('a BDM can withdraw their own pending MTP; a non-pending MTP cannot be withdrawn', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});

  const withdrawn = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/withdraw`);
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.mtp.status, 'withdrawn');

  const again = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/withdraw`);
  assert.equal(again.status, 400);
});

// ---------- Pending inbox scoping ----------

test('an ASM\'s pending-approvals inbox shows only MTPs submitted to them', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();

  const mine = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${mine.body.mtp._id}/submit`).send({});
  const other = await otherBdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await otherBdmAgent.patch(`/api/mtp/${other.body.mtp._id}/submit`).send({});

  const res = await asmAgent.get('/api/mtp/pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

// ---------- plannedVisits validation ----------

test('a mobile-built date-range block (multiple dates × multiple doctors, flattened client-side) is accepted and persisted as individual visits', async () => {
  // Mirrors what the mobile MTP screen's range-block UI actually sends: a
  // date range + area + doctor selection is flattened into one { doctorId,
  // date } row per (date, doctor) pair *before* it ever reaches this
  // endpoint — the server has no concept of a "range", only explicit visits.
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const docA = await asmAgent.post('/api/doctors').send({ name: 'Dr. Range A', area: 'Banjara Hills', assignedTo: String(bdm._id) });
  const docB = await asmAgent.post('/api/doctors').send({ name: 'Dr. Range B', area: 'Banjara Hills', assignedTo: String(bdm._id) });

  const rangeDates = ['2026-08-05', '2026-08-06', '2026-08-07'];
  const doctorIds = [docA.body.doctor._id, docB.body.doctor._id];
  const plannedVisits = rangeDates.flatMap((date) => doctorIds.map((doctorId) => ({ doctorId, date })));

  const res = await bdmAgent.post('/api/mtp').send({ month: '2026-08', plannedVisits });
  assert.equal(res.status, 201);
  assert.equal(res.body.mtp.plannedVisits.length, 6); // 3 dates × 2 doctors

  const byDate = {};
  res.body.mtp.plannedVisits.forEach((v) => {
    const key = new Date(v.date).toISOString().slice(0, 10);
    byDate[key] = (byDate[key] || 0) + 1;
  });
  rangeDates.forEach((d) => assert.equal(byDate[d], 2, `expected 2 visits on ${d}`));
});

test('a BDM cannot include a doctor not assigned to them in plannedVisits', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { asmAgent: otherAsmAgent, bdm: otherBdm } = await setupAsmBdm();
  const foreignDoctor = await otherAsmAgent.post('/api/doctors').send({ name: 'Dr. Foreign Owner', assignedTo: String(otherBdm._id) });
  assert.equal(foreignDoctor.status, 201);

  const res = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ doctorId: foreignDoctor.body.doctor._id, date: '2026-08-05' }]
  });
  assert.equal(res.status, 403);
  assert.match(res.body.message, /assigned to you/);
});

test('a planned visit date outside the plan\'s month is rejected', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. In Scope', assignedTo: String(bdm._id) });

  const res = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ doctorId: doctor.body.doctor._id, date: '2026-09-05' }]
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /within 2026-08/);
});

test('a duplicate doctor+date pair in plannedVisits is rejected', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Duplicate', assignedTo: String(bdm._id) });

  const res = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [
      { doctorId: doctor.body.doctor._id, date: '2026-08-05' },
      { doctorId: doctor.body.doctor._id, date: '2026-08-05' }
    ]
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Duplicate/);
});

test('a BDM can plan visits to their own assigned doctors within the month, and doctorId is populated on read', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Valid Visit', speciality: 'ENT', assignedTo: String(bdm._id) });

  const created = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ doctorId: doctor.body.doctor._id, date: '2026-08-12' }]
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.mtp.plannedVisits.length, 1);
  assert.equal(created.body.mtp.plannedVisits[0].doctorId.name, 'Dr. Valid Visit');

  const listed = await bdmAgent.get('/api/mtp?month=2026-08');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data[0].plannedVisits[0].doctorId.name, 'Dr. Valid Visit');
});

// ---------- Multiple independent tours in the same month ----------

test('a BDM can hold multiple independent tour plans in the same month, all listed together', async () => {
  const { bdmAgent } = await setupAsmBdm();

  const tour1 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Karimnagar tour' });
  const tour2 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Warangal tour' });
  assert.equal(tour1.status, 201);
  assert.equal(tour2.status, 201);
  assert.notEqual(tour1.body.mtp._id, tour2.body.mtp._id);

  const listed = await bdmAgent.get('/api/mtp?month=2026-11');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 2);
  const ids = listed.body.data.map((p) => p._id).sort();
  assert.deepEqual(ids, [tour1.body.mtp._id, tour2.body.mtp._id].sort());
});

test('creating a second tour after the first is approved leaves the first untouched, and both remain visible', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();

  const tour1 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Tour 1' });
  await bdmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/submit`).send({});
  const approved = await asmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(approved.body.mtp.status, 'approved');

  // Creating Tour 2 must not require touching Tour 1 at all.
  const tour2 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Tour 2' });
  assert.equal(tour2.status, 201);
  assert.equal(tour2.body.mtp.status, 'draft');
  await bdmAgent.patch(`/api/mtp/${tour2.body.mtp._id}/submit`).send({});

  const listed = await bdmAgent.get('/api/mtp?month=2026-11');
  assert.equal(listed.body.data.length, 2);
  const byId = Object.fromEntries(listed.body.data.map((p) => [p._id, p]));
  assert.equal(byId[tour1.body.mtp._id].status, 'approved', 'Tour 1 must still be approved');
  assert.equal(byId[tour2.body.mtp._id].status, 'pending', 'Tour 2 must be pending');
});

test('approving or rejecting one tour never affects another tour in the same month', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();

  const tour1 = await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  const tour2 = await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  const tour3 = await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await bdmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/submit`).send({});
  await bdmAgent.patch(`/api/mtp/${tour2.body.mtp._id}/submit`).send({});
  // Tour 3 stays a draft.

  await asmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/decision`).send({ status: 'approved' });
  await asmAgent.patch(`/api/mtp/${tour2.body.mtp._id}/decision`).send({ status: 'rejected', note: 'Wrong area' });

  const listed = await bdmAgent.get('/api/mtp?month=2026-11');
  const byId = Object.fromEntries(listed.body.data.map((p) => [p._id, p]));
  assert.equal(byId[tour1.body.mtp._id].status, 'approved');
  assert.equal(byId[tour2.body.mtp._id].status, 'rejected');
  assert.equal(byId[tour2.body.mtp._id].decisionNote, 'Wrong area');
  assert.equal(byId[tour3.body.mtp._id].status, 'draft');
});

test('a BDM never sees another BDM\'s tours, even across multiple tours per month', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await otherBdmAgent.post('/api/mtp').send({ month: '2026-11' });

  const mine = await bdmAgent.get('/api/mtp?month=2026-11');
  assert.equal(mine.body.data.length, 2);
});

test('an ASM sees every one of their BDM\'s multiple tours for a month via /team, but not an unrelated BDM\'s', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const { bdmAgent: unrelatedBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await unrelatedBdmAgent.post('/api/mtp').send({ month: '2026-11' });

  const res = await asmAgent.get('/api/mtp/team?month=2026-11');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);
  assert.ok(res.body.data.every((p) => String(p.userId._id || p.userId) === String(bdm._id)));
});

// ---------- Tenant isolation ----------

test('an admin in one company never sees MTPs from another company via /team', async () => {
  const companyA = await createCompany({ slug: 'mtp-alpha' });
  const companyB = await createCompany({ slug: 'mtp-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const bdmB = await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const bdmBAgent = await loginAs(companyB, bdmB);
  await bdmBAgent.post('/api/mtp').send({ month: '2026-08' });

  const res = await adminA.get('/api/mtp/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
