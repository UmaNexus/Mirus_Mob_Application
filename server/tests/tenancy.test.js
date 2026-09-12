import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('same email can exist in two different companies', async () => {
  const a = await createCompany({ slug: 'alpha' });
  const b = await createCompany({ slug: 'beta' });
  const u1 = await createUser({ companyId: a._id, email: 'dup@x.com' });
  const u2 = await createUser({ companyId: b._id, email: 'dup@x.com' });
  assert.notEqual(String(u1._id), String(u2._id));
  assert.notEqual(String(u1.companyId), String(u2.companyId));
});

test('login is scoped to the company code', async () => {
  const a = await createCompany({ slug: 'alpha' });
  await createUser({ companyId: a._id, email: 'user@x.com', password: 'Password1' });

  // Correct company code works.
  const ok = await request(app).post('/api/auth/login').send({ companySlug: 'alpha', email: 'user@x.com', password: 'Password1' });
  assert.equal(ok.status, 200);

  // Same credentials under a different (existing) company code must fail.
  await createCompany({ slug: 'beta' });
  const wrong = await request(app).post('/api/auth/login').send({ companySlug: 'beta', email: 'user@x.com', password: 'Password1' });
  assert.equal(wrong.status, 401);
});

test('an admin cannot see or mutate another company\'s users', async () => {
  const b = await createCompany({ slug: 'beta' });
  const victim = await createUser({ companyId: b._id, email: 'victim@beta.com' });

  // Admin in company alpha.
  const { agent } = await authAgent(app, { company: await createCompany({ slug: 'alpha' }), email: 'admin@alpha.com', role: 'admin' });

  // Directory lists only alpha users (the admin), never beta's victim.
  const list = await agent.get('/api/users');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.every((u) => u.email !== 'victim@beta.com'));

  // Direct lookups/mutations of a cross-tenant id are invisible (404).
  assert.equal((await agent.get(`/api/users/${victim._id}`)).status, 404);
  assert.equal((await agent.put(`/api/users/${victim._id}`).send({ firstName: 'Hacked' })).status, 404);
  assert.equal((await agent.delete(`/api/users/${victim._id}`)).status, 404);
});

test('cross-tenant salary template names do not collide', async () => {
  // Both companies can have a template called "Standard".
  const a = await createCompany({ slug: 'alpha' });
  const b = await createCompany({ slug: 'beta' });
  const { agent: aAgent } = await authAgent(app, { company: a, email: 'admin@alpha.com', role: 'admin' });
  const { agent: bAgent } = await authAgent(app, { company: b, email: 'admin@beta.com', role: 'admin' });

  const body = { name: 'Standard', earningsStructure: [{ key: 'basic', label: 'Basic', calculationType: 'percentage_of_ctc', valueFactor: 100 }], deductionsStructure: [] };
  assert.equal((await aAgent.post('/api/salary-templates').send(body)).status, 201);
  assert.equal((await bAgent.post('/api/salary-templates').send(body)).status, 201);

  // Each admin sees exactly one "Standard" — their own.
  const aList = await aAgent.get('/api/salary-templates');
  assert.equal(aList.body.data.filter((t) => t.name === 'Standard').length, 1);
});
