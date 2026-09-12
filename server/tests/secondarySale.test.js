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
  assert.equal((await request(app).get('/api/secondary-sales')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/secondary-sales')).status, 403);
});

test('a BDM can record a secondary sale; value is stored in integer paisa', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const res = await bdmAgent.post('/api/secondary-sales').send({ productName: 'Cardivax 5mg', batchNumber: 'C224', quantity: 48, value: 4800, expiryDate: '2026-09-30' });
  assert.equal(res.status, 201);
  assert.equal(res.body.sale.value, 480000);
});

test('the caller\'s own list populates the linked stockist\'s name (not just its id)', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const stockist = await bdmAgent.post('/api/stockists').send({ name: 'Mehta Pharma Distributors' });
  await bdmAgent.post('/api/secondary-sales').send({ productName: 'Cardivax 5mg', stockistId: stockist.body.stockist._id });

  const res = await bdmAgent.get('/api/secondary-sales');
  assert.equal(res.status, 200);
  assert.equal(res.body.data[0].stockistId.name, 'Mehta Pharma Distributors');
});

test('a BDM cannot link a secondary sale to a stockist they don\'t own', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();
  const stockist = await otherBdmAgent.post('/api/stockists').send({ name: 'Other Distributors' });

  const res = await bdmAgent.post('/api/secondary-sales').send({ productName: 'Gluconorm XR', stockistId: stockist.body.stockist._id });
  assert.equal(res.status, 400);
});

test('a BDM can only edit their own secondary sale records', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();
  const created = await otherBdmAgent.post('/api/secondary-sales').send({ productName: 'Other Product' });

  const res = await bdmAgent.patch(`/api/secondary-sales/${created.body.sale._id}`).send({ productName: 'Hijacked' });
  assert.equal(res.status, 403);
});

test('expiry alerts only surface batches expiring within 30 days', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  const farFuture = new Date(Date.now() + 200 * 86400000).toISOString();
  await bdmAgent.post('/api/secondary-sales').send({ productName: 'Expiring Soon', expiryDate: soon });
  await bdmAgent.post('/api/secondary-sales').send({ productName: 'Not Yet', expiryDate: farFuture });

  const res = await bdmAgent.get('/api/secondary-sales/alerts');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].productName, 'Expiring Soon');
});

test('an ASM sees their subtree BDM\'s secondary sales via /team but not an unrelated BDM\'s', async () => {
  const { asmAgent, bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/secondary-sales').send({ productName: 'Mine Product' });
  await otherBdmAgent.post('/api/secondary-sales').send({ productName: 'Unrelated Product' });

  const res = await asmAgent.get('/api/secondary-sales/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].productName, 'Mine Product');
});

test('an admin in one company never sees secondary sales from another company via /team', async () => {
  const companyA = await createCompany({ slug: 'ss-alpha' });
  const companyB = await createCompany({ slug: 'ss-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const bdmB = await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const bdmBAgent = await loginAs(companyB, bdmB);
  await bdmBAgent.post('/api/secondary-sales').send({ productName: 'Beta Product' });

  const res = await adminA.get('/api/secondary-sales/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
