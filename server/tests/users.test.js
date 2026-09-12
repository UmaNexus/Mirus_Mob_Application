import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const adminAgent = () => authAgent(app, { email: 'admin@xyz.com', role: 'admin' });

test('directory listing is paginated and defaults to 10 per page', async () => {
  const { agent } = await adminAgent();
  for (let i = 0; i < 14; i++) {
    await createUser({ email: `e${i}@xyz.com`, personalDetails: { firstName: `Emp${i}` } });
  }
  const res = await agent.get('/api/users');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 10);
  assert.equal(res.body.pagination.total, 15); // 14 + admin
  assert.equal(res.body.pagination.pages, 2);
});

test('employee role cannot access the directory', async () => {
  const { agent } = await authAgent(app, { email: 'emp@xyz.com', role: 'employee' });
  const res = await agent.get('/api/users');
  assert.equal(res.status, 403);
});

test('search filters by name', async () => {
  const { agent } = await adminAgent();
  await createUser({ email: 'rahul@xyz.com', personalDetails: { firstName: 'Rahul', lastName: 'Kumar' } });
  await createUser({ email: 'priya@xyz.com', personalDetails: { firstName: 'Priya', lastName: 'Sharma' } });

  const res = await agent.get('/api/users').query({ search: 'Rahul' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].personalDetails.firstName, 'Rahul');
});

test('filter by role and status', async () => {
  const { agent } = await adminAgent();
  await createUser({ email: 'hr1@xyz.com', role: 'hr', isActive: true });
  await createUser({ email: 'inactive@xyz.com', role: 'employee', isActive: false });

  const hr = await agent.get('/api/users').query({ role: 'hr' });
  assert.equal(hr.body.data.length, 1);

  const inactive = await agent.get('/api/users').query({ status: 'inactive' });
  assert.equal(inactive.body.data.every((u) => u.isActive === false), true);
});

test('update a user record', async () => {
  const { agent } = await adminAgent();
  const target = await createUser({ email: 'edit@xyz.com', personalDetails: { firstName: 'Old' } });
  const res = await agent.put(`/api/users/${target._id}`).send({ firstName: 'New', department: 'Engineering' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.personalDetails.firstName, 'New');
  assert.equal(res.body.user.employeeDetails.department, 'Engineering');
});

test('soft-delete hides the user from the default listing but restore brings it back', async () => {
  const { agent } = await adminAgent();
  const target = await createUser({ email: 'gone@xyz.com' });

  const del = await agent.delete(`/api/users/${target._id}`);
  assert.equal(del.status, 200);

  const listed = await agent.get('/api/users').query({ search: 'gone@xyz.com' });
  assert.equal(listed.body.data.length, 0);

  const withDeleted = await agent.get('/api/users').query({ search: 'gone@xyz.com', includeDeleted: 'true' });
  assert.equal(withDeleted.body.data.length, 1);

  const restore = await agent.post(`/api/users/${target._id}/restore`);
  assert.equal(restore.status, 200);

  const again = await agent.get('/api/users').query({ search: 'gone@xyz.com' });
  assert.equal(again.body.data.length, 1);
});

test('cannot soft-delete your own account', async () => {
  const { agent, user } = await adminAgent();
  const res = await agent.delete(`/api/users/${user._id}`);
  assert.equal(res.status, 400);
});

test('invalid object id -> 400', async () => {
  const { agent } = await adminAgent();
  const res = await agent.get('/api/users/not-an-id');
  assert.equal(res.status, 400);
});

test('permanent delete removes a soft-deleted user without payslips', async () => {
  const { agent } = await adminAgent();
  const target = await createUser({ email: 'purge@xyz.com' });

  await agent.delete(`/api/users/${target._id}`);
  const del = await agent.delete(`/api/users/${target._id}/permanent`);
  assert.equal(del.status, 200);

  const withDeleted = await agent.get('/api/users').query({ search: 'purge@xyz.com', includeDeleted: 'true' });
  assert.equal(withDeleted.body.data.length, 0);
});

test('cannot permanently delete a user who is not soft-deleted', async () => {
  const { agent } = await adminAgent();
  const target = await createUser({ email: 'live@xyz.com' });
  const res = await agent.delete(`/api/users/${target._id}/permanent`);
  assert.equal(res.status, 400);
});
