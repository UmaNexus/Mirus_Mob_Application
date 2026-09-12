import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent } from './helpers/factories.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('onboarding wizard advances stage through all five steps', async () => {
  const { agent } = await authAgent(app, { email: 'newjoiner@xyz.com', role: 'employee' });

  let status = await agent.get('/api/onboarding/status');
  assert.equal(status.body.stage, 'personal');

  // Empty bloodGroup must be accepted (wizard sends '' when optional field left blank).
  const personal = await agent.patch('/api/onboarding/personal').send({
    firstName: 'Rahul', lastName: 'Kumar', dateOfBirth: '1995-03-12', gender: 'Male', bloodGroup: '', maritalStatus: 'Single'
  });
  assert.equal(personal.status, 200);
  assert.equal(personal.body.stage, 'family');
  await agent.patch('/api/onboarding/family').send({ familyDetails: [{ name: 'Mr Kumar', relationship: 'Father', dependent: true }] });
  await agent.patch('/api/onboarding/contact').send({
    personalMobile: '9876543210', emergencyContactName: 'Sister', emergencyContactRelation: 'Sibling',
    emergencyContactPhone: '9876500000', presentAddress: { street: '123 Tech Lane', city: 'Hyderabad', state: 'Telangana', zipCode: '500001' },
    sameAsPresent: true
  });
  const exp = await agent.patch('/api/onboarding/experience').send({ notApplicable: true, experienceHistory: [] });
  assert.equal(exp.body.stage, 'bank');
  assert.equal(exp.body.previousEmployerNotApplicable, true);

  const bank = await agent.patch('/api/onboarding/bank').send({
    accountHolderName: 'Rahul Kumar', accountNumber: '123456789012', bankName: 'HDFC', ifscCode: 'HDFC0001234', panNumber: 'ABCDE1234F'
  });
  assert.equal(bank.body.stage, 'completed');

  status = await agent.get('/api/onboarding/status');
  assert.equal(status.body.sections.personal, true);
  assert.equal(status.body.sections.family, true);
  assert.equal(status.body.sections.contact, true);
  assert.equal(status.body.sections.experience, true);
  assert.equal(status.body.sections.bank, true);
});

test('onboarding validation rejects a bad IFSC', async () => {
  const { agent } = await authAgent(app, { email: 'b@xyz.com', role: 'employee' });
  const res = await agent.patch('/api/onboarding/bank').send({
    accountHolderName: 'X', accountNumber: '123456789012', bankName: 'HDFC', ifscCode: 'bad'
  });
  assert.equal(res.status, 400);
});

test('document vault: upload PDF, list, HR verifies, owner-only stream', async () => {
  const { agent: emp, user } = await authAgent(app, { email: 'emp@xyz.com', role: 'employee' });

  const nonPdf = await emp.post('/api/documents')
    .field('documentType', 'PAN').field('documentNumber', 'ABCDE1234F')
    .attach('document', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(nonPdf.status, 400);

  const up = await emp.post('/api/documents')
    .field('documentType', 'PAN').field('documentNumber', 'ABCDE1234F')
    .attach('document', PDF, { filename: 'pan.pdf', contentType: 'application/pdf' });
  assert.equal(up.status, 201);
  const fileId = up.body.fileId;

  const mine = await emp.get('/api/documents');
  assert.equal(mine.body.data.length, 1);
  assert.equal(mine.body.data[0].verificationStatus, 'Pending');

  // Stream own document.
  const stream = await emp.get(`/api/documents/file/${fileId}`);
  assert.equal(stream.status, 200);
  assert.equal(stream.headers['content-type'], 'application/pdf');

  // HR verifies.
  const { agent: hr } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  const verify = await hr.patch(`/api/documents/file/${fileId}/verify`).send({ status: 'Verified' });
  assert.equal(verify.body.document.verificationStatus, 'Verified');

  // HR can list the user's vault.
  const hrList = await hr.get(`/api/documents/user/${user._id}`);
  assert.equal(hrList.body.data.length, 1);
});

test('another employee cannot stream someone else\'s document', async () => {
  const { agent: owner } = await authAgent(app, { email: 'owner@xyz.com', role: 'employee' });
  const up = await owner.post('/api/documents')
    .field('documentType', 'Aadhar').field('documentNumber', '111122223333')
    .attach('document', PDF, { filename: 'aadhar.pdf', contentType: 'application/pdf' });
  const fileId = up.body.fileId;

  const { agent: other } = await authAgent(app, { email: 'other@xyz.com', role: 'employee' });
  const res = await other.get(`/api/documents/file/${fileId}`);
  assert.equal(res.status, 403);
});
