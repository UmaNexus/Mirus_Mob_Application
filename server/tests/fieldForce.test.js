import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

// ---------- Schema backward compatibility ----------

test('existing employee documents (no fieldForce) remain valid — no migration needed', async () => {
  const user = await createUser({ email: 'plain@xyz.com' });
  assert.equal(user.employeeDetails?.fieldForce?.tier ?? null, null);
  // Re-fetch to make sure the optional sub-doc doesn't break reads either.
  const reloaded = await user.constructor.findById(user._id);
  assert.equal(reloaded.employeeDetails?.fieldForce?.tier ?? null, null);
});

// ---------- requireFieldTier / route-level authorization ----------

test('unauthenticated request to a field-force route is rejected', async () => {
  const res = await request(app).get('/api/field-force/team');
  assert.equal(res.status, 401);
});

test('an employee with no fieldForce tier and no admin access is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  const res = await agent.get('/api/field-force/team');
  assert.equal(res.status, 403);
});

test('HR role alone (no fieldForce tier) is denied field-force access', async () => {
  // HR has broad HRMS permissions but no FIELDOPS_MONITOR grant and no tier —
  // proves this is not a simple role check being satisfied by accident.
  const { agent } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  const res = await agent.get('/api/field-force/team');
  assert.equal(res.status, 403);
});

// ---------- Reporting-hierarchy scoping ----------

test('a BDM with no reports sees only themselves', async () => {
  const { agent, user } = await authAgent(app, {
    email: 'bdm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' } }
  });
  const res = await agent.get('/api/field-force/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.scope, 'subtree');
  assert.equal(res.body.data.length, 1);
  assert.equal(String(res.body.data[0]._id), String(user._id));
});

test('an ASM sees themselves plus their direct-report BDMs, but not unrelated BDMs', async () => {
  const company = await getDefaultCompany();
  const { agent, user: asm } = await authAgent(app, {
    email: 'asm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'ASM' } }
  });
  const ownBdm = await createUser({
    companyId: company._id,
    email: 'own-bdm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const otherAsm = await createUser({ companyId: company._id, email: 'other-asm@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  await createUser({
    companyId: company._id,
    email: 'unrelated-bdm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: otherAsm._id }
  });

  const res = await agent.get('/api/field-force/team');
  assert.equal(res.status, 200);
  const ids = res.body.data.map((u) => String(u._id)).sort();
  assert.deepEqual(ids, [String(asm._id), String(ownBdm._id)].sort());
});

test('an RSM sees the full multi-level subtree: their ASMs and those ASMs\' BDMs', async () => {
  const company = await getDefaultCompany();
  const { agent, user: rsm } = await authAgent(app, {
    email: 'rsm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'RSM' } }
  });
  const asm = await createUser({
    companyId: company._id,
    email: 'asm2@xyz.com',
    employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id }
  });
  const bdm = await createUser({
    companyId: company._id,
    email: 'bdm2@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });

  const res = await agent.get('/api/field-force/team');
  assert.equal(res.status, 200);
  const ids = res.body.data.map((u) => String(u._id)).sort();
  assert.deepEqual(ids, [String(rsm._id), String(asm._id), String(bdm._id)].sort());
});

// ---------- Tenant isolation ----------

test('a BDM in another company never appears in this company\'s admin field-force list', async () => {
  const companyA = await createCompany({ slug: 'alpha' });
  const companyB = await createCompany({ slug: 'beta' });
  await createUser({ companyId: companyA._id, email: 'bdm-a@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });

  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const res = await adminA.get('/api/field-force/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.scope, 'company');
  assert.ok(res.body.data.every((u) => u.email !== 'bdm-b@xyz.com'));
  assert.ok(res.body.data.some((u) => u.email === 'bdm-a@xyz.com'));
});

// ---------- Admin company-wide access ----------

test('admin (no fieldForce tier of their own) sees every field-force user company-wide, not a subtree', async () => {
  const company = await getDefaultCompany();
  const { agent: adminAgent } = await authAgent(app, { email: 'admin@xyz.com', role: 'admin' });
  const nsm = await createUser({ companyId: company._id, email: 'nsm@xyz.com', employeeDetails: { fieldForce: { tier: 'NSM' } } });
  const bdm = await createUser({ companyId: company._id, email: 'bdm3@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });

  const res = await adminAgent.get('/api/field-force/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.scope, 'company');
  const ids = res.body.data.map((u) => String(u._id));
  assert.ok(ids.includes(String(nsm._id)));
  assert.ok(ids.includes(String(bdm._id)));
});

// ---------- Assigning a tier reuses the existing user-update endpoint ----------

test('admin can assign a fieldForce tier via the existing PUT /api/users/:id endpoint', async () => {
  const { agent: adminAgent } = await authAgent(app, { email: 'admin2@xyz.com', role: 'admin' });
  const target = await createUser({ email: 'newbdm@xyz.com', role: 'employee' });

  const res = await adminAgent.put(`/api/users/${target._id}`).send({ fieldForceTier: 'BDM', fieldForceTerritory: 'Pune Central' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.employeeDetails.fieldForce.tier, 'BDM');
  assert.equal(res.body.user.employeeDetails.fieldForce.territory, 'Pune Central');
});

test('an invalid fieldForce tier is rejected by validation before any write', async () => {
  const { agent: adminAgent } = await authAgent(app, { email: 'admin3@xyz.com', role: 'admin' });
  const target = await createUser({ email: 'bad-tier@xyz.com', role: 'employee' });

  const res = await adminAgent.put(`/api/users/${target._id}`).send({ fieldForceTier: 'REGIONAL_MANAGER' });
  assert.equal(res.status, 400);
});

test('HR (not just admin) can also assign a fieldForce tier, consistent with existing USER_UPDATE grant', async () => {
  const { agent: hrAgent } = await authAgent(app, { email: 'hr2@xyz.com', role: 'hr' });
  const target = await createUser({ email: 'hr-assign@xyz.com', role: 'employee' });

  const res = await hrAgent.put(`/api/users/${target._id}`).send({ fieldForceTier: 'ASM' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.employeeDetails.fieldForce.tier, 'ASM');
});
