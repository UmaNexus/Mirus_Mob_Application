import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).post('/api/attendance/punch-in')).status, 401);
});

test('a plain employee with no fieldForce tier CAN use the punch endpoints — only Admin/superadmin are excluded', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  const res = await agent.post('/api/attendance/punch-in');
  assert.equal(res.status, 200);
  assert.ok(res.body.record.punchInAt);
});

test('HR can use the punch endpoints', async () => {
  const { agent } = await authAgent(app, { email: 'hr-punch@xyz.com', role: 'hr' });
  const res = await agent.post('/api/attendance/punch-in');
  assert.equal(res.status, 200);
});

test('admin cannot use the punch endpoints', async () => {
  const { agent } = await authAgent(app, { email: 'admin-punch@xyz.com', role: 'admin' });
  assert.equal((await agent.post('/api/attendance/punch-in')).status, 403);
  assert.equal((await agent.post('/api/attendance/punch-out')).status, 403);
  assert.equal((await agent.get('/api/attendance/today')).status, 403);
});

test('a BDM can punch in, see today\'s status, and punch out with worked hours computed', async () => {
  const { agent } = await authAgent(app, { email: 'bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });

  const before = await agent.get('/api/attendance/today');
  assert.equal(before.status, 200);
  assert.equal(before.body.record, null);

  const in1 = await agent.post('/api/attendance/punch-in');
  assert.equal(in1.status, 200);
  assert.ok(in1.body.record.punchInAt);
  assert.equal(in1.body.record.punchOutAt, null);
  assert.equal(in1.body.record.status, 'Present');

  const today = await agent.get('/api/attendance/today');
  assert.ok(today.body.record.punchInAt);

  const out1 = await agent.post('/api/attendance/punch-out');
  assert.equal(out1.status, 200);
  assert.ok(out1.body.record.punchOutAt);
  assert.equal(typeof out1.body.record.workedHours, 'number');
});

test('punching in twice without punching out is rejected', async () => {
  const { agent } = await authAgent(app, { email: 'bdm2@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  await agent.post('/api/attendance/punch-in');
  const again = await agent.post('/api/attendance/punch-in');
  assert.equal(again.status, 400);
});

test('punching out without having punched in is rejected', async () => {
  const { agent } = await authAgent(app, { email: 'bdm3@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const res = await agent.post('/api/attendance/punch-out');
  assert.equal(res.status, 400);
});

test('punching out twice is rejected', async () => {
  const { agent } = await authAgent(app, { email: 'bdm4@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  await agent.post('/api/attendance/punch-in');
  await agent.post('/api/attendance/punch-out');
  const again = await agent.post('/api/attendance/punch-out');
  assert.equal(again.status, 400);
});

test('existing whole-day attendance marking is unaffected by the new punch fields', async () => {
  const { agent } = await authAgent(app, { email: 'bdm5@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const marked = await agent.post('/api/attendance/mark').send({ status: 'Present', checkIn: '09:00', checkOut: '18:00' });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.record.checkIn, '09:00');
  assert.equal(marked.body.record.punchInAt, null);
});
