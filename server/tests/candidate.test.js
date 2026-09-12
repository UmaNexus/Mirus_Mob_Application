import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, DEFAULT_COMPANY_SLUG } from './helpers/factories.js';
import { clearOutbox, getOutbox } from '../services/emailService.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';

// 1x1 transparent PNG (valid base64 for signature baking).
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); clearOutbox(); });

const stageOffer = async () => {
  const { agent, company } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  await SalaryStructureTemplate.create({
    companyId: company._id,
    name: 'Eng',
    earningsStructure: [
      { key: 'basic', label: 'Basic', calculationType: 'percentage_of_ctc', valueFactor: 45 },
      { key: 'special', label: 'Special', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [{ key: 'pf', label: 'PF', calculationType: 'percentage_of_basic', valueFactor: 12 }]
  });
  const tpl = await SalaryStructureTemplate.findOne({ companyId: company._id, name: 'Eng' });
  const res = await agent.post('/api/offers').send({
    candidateEmail: 'cand@example.com', fullName: 'Vikram Singh', position: 'Designer',
    department: 'Design', joiningDate: '2026-07-15', templateId: tpl._id, annualCTC: 1200000
  });
  return { agent, token: res.body.accessToken, offerId: res.body.offer._id };
};

test('candidate views offer + compensation breakdown via magic link', async () => {
  const { token } = await stageOffer();
  const res = await request(app).get(`/api/candidate/offer/${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.offer.fullName, 'Vikram Singh');
  // gross ₹100,000 − PF (12% of ₹45,000 basic = ₹5,400) = ₹94,600.
  assert.equal(res.body.compensation.netTakeHome, 9460000);
  assert.match(res.body.compensation.netTakeHomeDisplay, /INR/);
});

test('invalid token is rejected with 401', async () => {
  const res = await request(app).get('/api/candidate/offer/deadbeef');
  assert.equal(res.status, 401);
});

test('e-sign moves offer to awaiting-approval without issuing credentials', async () => {
  const { token } = await stageOffer();

  const sign = await request(app).post(`/api/candidate/offer/${token}/sign`).send({ signatureBase64: SIGNATURE });
  assert.equal(sign.status, 200);
  assert.ok(sign.body.signedPdfFileUrl);
  assert.ok(sign.body.verificationToken);
  assert.equal(sign.body.status, 'signed');

  // No credentials are emailed at sign time — provisioning is gated on approval.
  assert.equal(getOutbox().filter((m) => m.meta.type === 'credentials').length, 0);

  // Re-signing an already-signed offer is rejected.
  const reuse = await request(app).post(`/api/candidate/offer/${token}/sign`).send({ signatureBase64: SIGNATURE });
  assert.equal(reuse.status, 409);

  // Account cannot be logged into before approval.
  const earlyLogin = await request(app).post('/api/auth/login').send({ companySlug: DEFAULT_COMPANY_SLUG, email: 'cand@example.com', password: 'NewPass123' });
  assert.equal(earlyLogin.status, 401);
});

test('HR approval provisions the employee and emails login credentials', async () => {
  const { agent, token, offerId } = await stageOffer();

  // Approval before signing is rejected.
  const early = await agent.post(`/api/offers/${offerId}/approve`);
  assert.equal(early.status, 400);

  await request(app).post(`/api/candidate/offer/${token}/sign`).send({ signatureBase64: SIGNATURE });

  const approve = await agent.post(`/api/offers/${offerId}/approve`);
  assert.equal(approve.status, 200);
  assert.equal(approve.body.offer.status, 'accepted');
  assert.ok(approve.body.employeeId, 'employee id assigned');
  assert.ok(approve.body.tempPassword, 'temp password exposed in non-prod');
  assert.equal(getOutbox().filter((m) => m.meta.type === 'credentials').length, 1);

  // Candidate can now log in with the emailed temporary password.
  const login = await request(app).post('/api/auth/login')
    .send({ companySlug: DEFAULT_COMPANY_SLUG, email: 'cand@example.com', password: approve.body.tempPassword });
  assert.equal(login.status, 200);

  // Approving twice is rejected.
  const again = await agent.post(`/api/offers/${offerId}/approve`);
  assert.equal(again.status, 400);
});

test('re-offer to a soft-deleted email restores the account and allows login after approval', async () => {
  const { agent, token, offerId } = await stageOffer();

  const user = await (await import('../models/User.js')).default.findOne({ email: 'cand@example.com' });
  user.deletedAt = new Date();
  user.isActive = false;
  await user.save();

  await request(app).post(`/api/candidate/offer/${token}/sign`).send({ signatureBase64: SIGNATURE });
  const approve = await agent.post(`/api/offers/${offerId}/approve`);
  assert.equal(approve.status, 200);

  const refreshed = await (await import('../models/User.js')).default.findOne({ email: 'cand@example.com' });
  assert.equal(refreshed.deletedAt, null);
  assert.equal(refreshed.isActive, true);

  const login = await request(app).post('/api/auth/login')
    .send({ companySlug: DEFAULT_COMPANY_SLUG, email: 'cand@example.com', password: approve.body.tempPassword });
  assert.equal(login.status, 200);
});
