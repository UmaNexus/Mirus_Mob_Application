import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import User from '../models/User.js';
import { authAgent, createUser, getDefaultCompany } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const loginAs = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return agent;
};

let n = 0;
const setupAsmBdm = async () => {
  n += 1;
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { company, email: `asm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: `bdm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const bdmAgent = await loginAs(company, bdm);
  return { company, asmAgent, asm, bdmAgent, bdm };
};

// ---------- Expenses ----------

test('an approved expense report row shows the actual approver, not derived from the current hierarchy', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/expenses').send({ category: 'Travel', date: '2026-08-12', amount: 500, from: 'Pune', to: 'Mumbai' });
  const id = created.body.expense._id;
  const decision = await asmAgent.patch(`/api/expenses/${id}/decision`).send({ status: 'approved', note: 'Looks good' });
  assert.equal(decision.status, 200);

  const list = await asmAgent.get('/api/expenses/team');
  assert.equal(list.status, 200);
  const row = list.body.data.find((e) => e._id === id);
  assert.equal(row.approval.status, 'approved');
  assert.equal(String(row.approval.decidedBy.userId), String(asm._id));
  assert.equal(row.approval.decidedBy.name, `${asm.personalDetails.firstName} ${asm.personalDetails.lastName}`);
  assert.equal(row.approval.decidedBy.role, 'ASM');
  assert.ok(row.approval.decidedAt);
  assert.equal(row.approval.reason, 'Looks good');
});

test('a rejected expense report row shows the actual rejector and the stored rejection reason', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/expenses').send({ category: 'Food', date: '2026-08-12', amount: 200 });
  const id = created.body.expense._id;
  await asmAgent.patch(`/api/expenses/${id}/decision`).send({ status: 'rejected', note: 'Missing receipt' });

  const list = await asmAgent.get('/api/expenses/team');
  const row = list.body.data.find((e) => e._id === id);
  assert.equal(row.approval.status, 'rejected');
  assert.equal(String(row.approval.decidedBy.userId), String(asm._id));
  assert.equal(row.approval.reason, 'Missing receipt');
});

test('a pending expense report row never shows a decidedBy, but does show who it is pending with', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  await bdmAgent.post('/api/expenses').send({ category: 'Misc', date: '2026-08-12', amount: 100 });

  const list = await asmAgent.get('/api/expenses/team');
  const row = list.body.data[0];
  assert.equal(row.approval.status, 'pending');
  assert.equal(row.approval.decidedBy, null);
  assert.equal(row.approval.decidedAt, null);
  assert.equal(String(row.approval.pendingWith.userId), String(asm._id));
  assert.equal(row.approval.pendingWith.role, 'ASM');
});

// ---------- Leave ----------

test('an approved/rejected leave report row shows the actual decision maker', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  const applied = await bdmAgent.post('/api/leaves').send({ type: 'Casual', fromDate: '2026-09-01', toDate: '2026-09-01', reason: 'Personal' });
  assert.equal(applied.status, 201);
  const id = applied.body.leave._id;
  await asmAgent.patch(`/api/leaves/${id}/decision`).send({ status: 'Approved', note: 'Enjoy' });

  const list = await asmAgent.get('/api/leaves');
  const row = list.body.data.find((l) => l._id === id);
  assert.equal(row.approval.status, 'approved');
  assert.equal(String(row.approval.decidedBy.userId), String(asm._id));
  assert.equal(row.approval.reason, 'Enjoy');
});

test('a leave still pending shows no decidedBy, but does show the requester\'s current manager as who it is pending with (leave has no stored designated-approver field)', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  await bdmAgent.post('/api/leaves').send({ type: 'Sick', fromDate: '2026-09-05', toDate: '2026-09-05', reason: 'Fever' });

  const list = await asmAgent.get('/api/leaves');
  const row = list.body.data[0];
  assert.equal(row.approval.status, 'pending');
  assert.equal(row.approval.decidedBy, null);
  assert.equal(String(row.approval.pendingWith.userId), String(asm._id));
});

// ---------- MTP ----------

test('an approved/rejected MTP report row shows the actual decision maker', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-09' });
  assert.equal(created.status, 201);
  const id = created.body.mtp._id;
  const submitted = await bdmAgent.patch(`/api/mtp/${id}/submit`).send({ approverId: String(asm._id) });
  assert.equal(submitted.status, 200);
  await asmAgent.patch(`/api/mtp/${id}/decision`).send({ status: 'approved', note: 'Approved as planned' });

  const list = await asmAgent.get('/api/mtp/team');
  const row = list.body.data.find((p) => p._id === id);
  assert.equal(row.approval.status, 'approved');
  assert.equal(String(row.approval.decidedBy.userId), String(asm._id));
  assert.equal(row.approval.reason, 'Approved as planned');
});

test('a submitted-but-undecided MTP shows no decidedBy, but does show the designated approver as who it is pending with', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-09' });
  const id = created.body.mtp._id;
  await bdmAgent.patch(`/api/mtp/${id}/submit`).send({ approverId: String(asm._id) });

  const list = await asmAgent.get('/api/mtp/team');
  const row = list.body.data.find((p) => p._id === id);
  assert.equal(row.approval.status, 'pending');
  assert.equal(row.approval.decidedBy, null);
  assert.equal(String(row.approval.pendingWith.userId), String(asm._id));
});

// ---------- Historical correctness after a hierarchy change ----------

test('a historical decision keeps showing the ORIGINAL approver after the BDM is re-parented to a new manager', async () => {
  const { company, asmAgent, bdmAgent, asm, bdm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/expenses').send({ category: 'Travel', date: '2026-08-01', amount: 400 });
  const id = created.body.expense._id;
  await asmAgent.patch(`/api/expenses/${id}/decision`).send({ status: 'approved', note: 'OK' });

  // Re-parent the BDM to a brand-new ASM — the reporting hierarchy changes,
  // but the historical decision record must not.
  const newAsm = await createUser({ companyId: company._id, email: `new-asm-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const { agent: adminAgent } = await authAgent(app, { company, email: `admin-${n}@xyz.com`, role: 'admin' });
  const reassign = await adminAgent.put(`/api/users/${bdm._id}`).send({ reportingManagerId: String(newAsm._id) });
  assert.equal(reassign.status, 200);

  const list = await adminAgent.get('/api/expenses/team');
  const row = list.body.data.find((e) => e._id === id);
  assert.equal(String(row.approval.decidedBy.userId), String(asm._id), 'the original approver, never the new manager');
  assert.notEqual(String(row.approval.decidedBy.userId), String(newAsm._id));
});

// ---------- Missing historical decision-maker data ----------

test('a record whose stored approver no longer resolves (hard-deleted) reports unknown rather than crashing', async () => {
  const { asmAgent, bdmAgent, asm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/expenses').send({ category: 'Stay', date: '2026-08-01', amount: 600 });
  const id = created.body.expense._id;
  await asmAgent.patch(`/api/expenses/${id}/decision`).send({ status: 'approved', note: 'OK' });

  await User.findByIdAndDelete(asm._id);

  const { agent: adminAgent } = await authAgent(app, { company: await getDefaultCompany(), email: `admin-orphan-${n}@xyz.com`, role: 'admin' });
  const list = await adminAgent.get('/api/expenses/team');
  assert.equal(list.status, 200, 'must not crash even though the approver record is gone');
  const row = list.body.data.find((e) => e._id === id);
  assert.equal(row.approval.status, 'approved');
  assert.equal(row.approval.decidedBy, null, 'unknown, not a guess');
});
