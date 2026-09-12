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

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/stockists')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/stockists')).status, 403);
});

test('a BDM can add a stockist; the last order amount is stored in integer paisa', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/stockists').send({ name: 'Mehta Pharma Distributors', lastOrderAmount: 42000, lastOrderDate: '2026-08-10' });
  assert.equal(res.status, 201);
  assert.equal(res.body.stockist.lastOrderAmount, 4200000);
});

test('a BDM can only edit their own stockists, not another BDM\'s', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();
  const created = await otherBdmAgent.post('/api/stockists').send({ name: 'Other Distributors' });

  const res = await bdmAgent.patch(`/api/stockists/${created.body.stockist._id}`).send({ name: 'Hijacked' });
  assert.equal(res.status, 403);
});

test('an ASM sees their subtree BDM\'s stockists via /team but not an unrelated BDM\'s', async () => {
  const { asmAgent, bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/stockists').send({ name: 'Mine Distributors' });
  await otherBdmAgent.post('/api/stockists').send({ name: 'Unrelated Distributors' });

  const res = await asmAgent.get('/api/stockists/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Mine Distributors');
});

test('an admin in one company never sees stockists from another company via /team', async () => {
  const companyA = await createCompany({ slug: 'stk-alpha' });
  const companyB = await createCompany({ slug: 'stk-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const bdmB = await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const bdmBAgent = await loginAs(companyB, bdmB);
  await bdmBAgent.post('/api/stockists').send({ name: 'Beta Distributors' });

  const res = await adminA.get('/api/stockists/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
