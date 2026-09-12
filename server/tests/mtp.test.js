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

test('a rejected MTP cannot be edited directly — it must be withdrawn or resubmitted through the normal flow', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});
  await asmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'rejected', note: 'Too many visits' });

  // Editing via upsert (POST /api/mtp for the same month) resets it to draft —
  // this IS the resubmission path, not a direct field edit on a rejected doc.
  const edited = await bdmAgent.post('/api/mtp').send({ month: '2026-08', remarks: 'Revised plan' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.mtp.status, 'draft');
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
