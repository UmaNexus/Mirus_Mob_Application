import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('HR can read the directory and edit users but cannot delete', async () => {
  const { agent: hr } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  const target = await createUser({ email: 'emp@xyz.com', role: 'employee' });

  assert.equal((await hr.get('/api/users')).status, 200);
  assert.equal((await hr.put(`/api/users/${target._id}`).send({ firstName: 'Edited' })).status, 200);
  assert.equal((await hr.delete(`/api/users/${target._id}`)).status, 403);
  assert.equal((await hr.post(`/api/users/${target._id}/restore`)).status, 403);
});

test('HR cannot change a user\'s role, admin can', async () => {
  const target = await createUser({ email: 'emp@xyz.com', role: 'employee' });

  const { agent: hr } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  const hrTry = await hr.put(`/api/users/${target._id}`).send({ role: 'admin' });
  assert.equal(hrTry.status, 403);

  const { agent: admin } = await authAgent(app, { email: 'admin@xyz.com', role: 'admin' });
  const adminTry = await admin.put(`/api/users/${target._id}`).send({ role: 'hr' });
  assert.equal(adminTry.status, 200);
  assert.equal(adminTry.body.user.role, 'hr');
});

test('HR retains day-to-day access (offers, dashboard, payroll list)', async () => {
  const { agent: hr } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  assert.equal((await hr.get('/api/offers')).status, 200);
  assert.equal((await hr.get('/api/dashboard/stats')).status, 200);
  assert.equal((await hr.get('/api/payslips')).status, 200);
});

test('employees are denied all management endpoints', async () => {
  const { agent: emp } = await authAgent(app, { email: 'e@xyz.com', role: 'employee' });
  assert.equal((await emp.get('/api/users')).status, 403);
  assert.equal((await emp.get('/api/offers')).status, 403);
  assert.equal((await emp.get('/api/dashboard/stats')).status, 403);
});
