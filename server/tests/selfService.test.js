import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('self-service hub returns a curated overview with reporting manager', async () => {
  const manager = await createUser({
    email: 'mgr@xyz.com', role: 'employee',
    personalDetails: { firstName: 'Priya', lastName: 'Sharma' },
    employeeDetails: { designation: 'Engineering Manager' }
  });

  const { agent } = await authAgent(app, {
    email: 'rahul@xyz.com', role: 'employee',
    personalDetails: { firstName: 'Rahul', lastName: 'Kumar' },
    employeeDetails: { employeeId: 'MMS45872', designation: 'Senior Software Engineer', department: 'Engineering', reportingManagerId: manager._id }
  });

  const res = await agent.get('/api/self-service/overview');
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.fullName, 'Rahul Kumar');
  assert.equal(res.body.profile.employeeId, 'MMS45872');
  assert.equal(res.body.profile.status, 'Active Employee');
  assert.equal(res.body.profile.reportingManager, 'Priya Sharma');
  assert.equal(res.body.latestPayslip, null);
  assert.equal(res.body.onboarding.stage, 'personal');
});

test('hub requires authentication', async () => {
  const res = await (await import('supertest')).default(app).get('/api/self-service/overview');
  assert.equal(res.status, 401);
});
