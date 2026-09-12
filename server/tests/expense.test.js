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

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/expenses')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/expenses')).status, 403);
});

// ---------- Create + paisa conversion ----------

test('a BDM can submit an expense; amount is stored in integer paisa', async () => {
  const { bdmAgent, asm } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/expenses').send({ category: 'Travel', date: '2026-08-12', amount: 850.5, from: 'Pune', to: 'Mumbai' });
  assert.equal(res.status, 201);
  assert.equal(res.body.expense.amount, 85050);
  assert.equal(String(res.body.expense.approverId), String(asm._id));
  assert.equal(res.body.expense.status, 'pending');
});

// ---------- Receipt upload + authorized access ----------

test('a BDM can attach a receipt and retrieve it themselves', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const created = await bdmAgent
    .post('/api/expenses')
    .field('category', 'Travel')
    .field('date', '2026-08-12')
    .field('amount', '500')
    .attach('receipt', Buffer.from('%PDF-1.4 fake'), { filename: 'receipt.pdf', contentType: 'application/pdf' });
  assert.equal(created.status, 201);
  assert.ok(created.body.expense.receiptFileUrl);

  const own = await bdmAgent.get(`/api/expenses/${created.body.expense._id}/receipt`);
  assert.equal(own.status, 200);
});

test('an unrelated BDM cannot retrieve someone else\'s receipt', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();
  const created = await bdmAgent
    .post('/api/expenses')
    .field('category', 'Travel')
    .field('date', '2026-08-12')
    .field('amount', '500')
    .attach('receipt', Buffer.from('%PDF-1.4 fake'), { filename: 'receipt.pdf', contentType: 'application/pdf' });

  const blocked = await otherBdmAgent.get(`/api/expenses/${created.body.expense._id}/receipt`);
  assert.equal(blocked.status, 403);
});

test('the claimant\'s own manager can retrieve the receipt', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const created = await bdmAgent
    .post('/api/expenses')
    .field('category', 'Travel')
    .field('date', '2026-08-12')
    .field('amount', '500')
    .attach('receipt', Buffer.from('%PDF-1.4 fake'), { filename: 'receipt.pdf', contentType: 'application/pdf' });

  const res = await asmAgent.get(`/api/expenses/${created.body.expense._id}/receipt`);
  assert.equal(res.status, 200);
});

// ---------- Approval: only the designated approver ----------

test('only the exact designated approver can decide a pending expense', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const { asmAgent: unrelatedAsmAgent } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/expenses').send({ category: 'Food', date: '2026-08-12', amount: 400 });

  const blocked = await unrelatedAsmAgent.patch(`/api/expenses/${created.body.expense._id}/decision`).send({ status: 'approved' });
  assert.equal(blocked.status, 403);

  const allowed = await asmAgent.patch(`/api/expenses/${created.body.expense._id}/decision`).send({ status: 'approved' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.expense.status, 'approved');
});

test('an already-decided expense cannot be decided again', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/expenses').send({ category: 'Food', date: '2026-08-12', amount: 400 });
  await asmAgent.patch(`/api/expenses/${created.body.expense._id}/decision`).send({ status: 'approved' });

  const again = await asmAgent.patch(`/api/expenses/${created.body.expense._id}/decision`).send({ status: 'rejected' });
  assert.equal(again.status, 400);
});

// ---------- Pending inbox scoping ----------

test('an ASM\'s pending-approvals inbox shows only expenses submitted to them', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/expenses').send({ category: 'Food', date: '2026-08-12', amount: 400 });
  await otherBdmAgent.post('/api/expenses').send({ category: 'Food', date: '2026-08-12', amount: 400 });

  const res = await asmAgent.get('/api/expenses/pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

// ---------- Tenant isolation ----------

test('an admin in one company never sees expenses from another company via /team', async () => {
  const companyA = await createCompany({ slug: 'exp-alpha' });
  const companyB = await createCompany({ slug: 'exp-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const bdmB = await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const bdmBAgent = await loginAs(companyB, bdmB);
  await bdmBAgent.post('/api/expenses').send({ category: 'Food', date: '2026-08-12', amount: 400 });

  const res = await adminA.get('/api/expenses/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
