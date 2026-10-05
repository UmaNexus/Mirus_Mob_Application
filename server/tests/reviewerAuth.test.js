import JobRole from '../models/JobRole.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { seedReviewerData, REVIEWER_PASSWORD } from '../scripts/seed-reviewer-account.js';
import Doctor from '../models/Doctor.js';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('reviewer accounts seed successfully with complete BDM and ASM field force hierarchy', async () => {
  const { bdm, asm, company } = await seedReviewerData();

  assert.equal(company.slug, 'dev');
  assert.equal(bdm.email, 'reviewer.bdm@dev.test');
  assert.equal((await JobRole.findById(bdm.employeeDetails.jobRole)).name, 'Business development manager');
  assert.equal(asm.email, 'reviewer.asm@dev.test');
  assert.equal((await JobRole.findById(asm.employeeDetails.jobRole)).name, 'Area sales manager');

  // Verify pre-seeded data for the BDM
  const doctors = await Doctor.find({ companyId: company._id, assignedTo: bdm._id });
  assert.ok(doctors.length >= 6, 'Reviewer BDM must have assigned doctors');

  const mtp = await MonthlyTourPlan.findOne({ companyId: company._id, userId: bdm._id });
  assert.ok(mtp, 'Reviewer BDM must have an MTP plan');
  assert.equal(mtp.status, 'approved');
});

test('reviewer BDM can authenticate via POST /api/auth/login with companySlug: dev', async () => {
  await seedReviewerData();

  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Client', 'mobile')
    .send({
      companySlug: 'dev',
      identifier: 'reviewer.bdm@dev.test',
      password: REVIEWER_PASSWORD
    });

  assert.equal(res.status, 200);
  assert.ok(res.body.token, 'Mobile client must receive Bearer token');
  assert.equal(res.body.user.email, 'reviewer.bdm@dev.test');
  assert.equal(res.body.fieldAccess.roleName, 'Business development manager');
  assert.equal(res.body.fieldAccess.isFieldUser, true);
});

test('reviewer ASM can authenticate via POST /api/auth/login with companySlug: dev', async () => {
  await seedReviewerData();

  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Client', 'mobile')
    .send({
      companySlug: 'dev',
      identifier: 'reviewer.asm@dev.test',
      password: REVIEWER_PASSWORD
    });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, 'reviewer.asm@dev.test');
  assert.equal(res.body.fieldAccess.roleName, 'Area sales manager');
  assert.equal(res.body.fieldAccess.isManager, true);
});

test('reviewer BDM can punch in/out without any errors or OTP prompts', async () => {
  await seedReviewerData();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('X-Client', 'mobile')
    .send({
      companySlug: 'dev',
      identifier: 'reviewer.bdm@dev.test',
      password: REVIEWER_PASSWORD
    });

  const token = loginRes.body.token;

  // Punch in
  const punchInRes = await request(app)
    .post('/api/attendance/punch-in')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Client', 'mobile');

  assert.equal(punchInRes.status, 200);
  assert.ok(punchInRes.body.record.punchInAt);

  // Punch out
  const punchOutRes = await request(app)
    .post('/api/attendance/punch-out')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Client', 'mobile');

  assert.equal(punchOutRes.status, 200);
  assert.ok(punchOutRes.body.record.punchOutAt);
});
