import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent } from './helpers/factories.js';
import { clearOutbox, getOutbox } from '../services/emailService.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); clearOutbox(); });

const TEMPLATE = {
  name: 'Engineering-V2',
  earningsStructure: [
    { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 },
    { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
  ],
  deductionsStructure: [{ key: 'pf', label: 'PF', calculationType: 'percentage_of_basic', valueFactor: 12 }]
};

const setup = async () => {
  const { agent, company } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });
  const tpl = await SalaryStructureTemplate.create({ ...TEMPLATE, companyId: company._id });
  return { agent, tpl, company };
};

test('create a single offer: stages candidate, freezes salary, emails magic link', async () => {
  const { agent, tpl } = await setup();
  const res = await agent.post('/api/offers').send({
    candidateEmail: 'vikram@example.com',
    fullName: 'Vikram Singh',
    position: 'UI/UX Designer',
    department: 'Design',
    joiningDate: '2026-07-15',
    templateId: tpl._id,
    annualCTC: 1200000
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.offer.status, 'sent');
  assert.ok(res.body.accessToken, 'raw token exposed in non-prod');
  assert.ok(res.body.emailPreview?.subject);
  assert.ok(res.body.emailPreview?.body);
  const invite = getOutbox().filter((m) => m.meta.type === 'offer_invite');
  assert.equal(invite.length, 1);
  assert.equal(invite[0].attachmentCount, 1);
});

test('preview then send: generate without email, then send with edited subject/body', async () => {
  const { agent, tpl } = await setup();
  const created = await agent.post('/api/offers').send({
    candidateEmail: 'preview@example.com',
    fullName: 'Preview User',
    position: 'Analyst',
    department: 'Finance',
    joiningDate: '2026-09-01',
    templateId: tpl._id,
    annualCTC: 800000,
    sendEmail: false
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.offer.status, 'pending');
  assert.equal(getOutbox().filter((m) => m.meta.type === 'offer_invite').length, 0);
  assert.ok(created.body.emailPreview?.subject);

  const sent = await agent.post(`/api/offers/${created.body.offer._id}/send`).send({
    subject: 'Custom subject for Preview User',
    body: created.body.emailPreview.body
  });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.offer.status, 'sent');
  const invite = getOutbox().filter((m) => m.meta.type === 'offer_invite');
  assert.equal(invite.length, 1);
  assert.equal(invite[0].subject, 'Custom subject for Preview User');
  assert.equal(invite[0].attachmentCount, 1);
});

test('offer creation validates required fields', async () => {
  const { agent, tpl } = await setup();
  const res = await agent.post('/api/offers').send({ candidateEmail: 'bad', templateId: tpl._id });
  assert.equal(res.status, 400);
});

test('list, view PDF, status transition, and resend', async () => {
  const { agent, tpl } = await setup();
  const created = await agent.post('/api/offers').send({
    candidateEmail: 'neha@example.com', fullName: 'Neha Gupta', position: 'QA Engineer',
    department: 'Engineering', joiningDate: '2026-08-01', templateId: tpl._id, annualCTC: 900000
  });
  const id = created.body.offer._id;

  const list = await agent.get('/api/offers').query({ status: 'sent' });
  assert.equal(list.body.data.length, 1);

  const pdf = await agent.get(`/api/offers/${id}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');

  const status = await agent.patch(`/api/offers/${id}/status`).send({ status: 'accepted' });
  assert.equal(status.body.offer.status, 'accepted');

  // Cannot resend an accepted offer.
  const resend = await agent.post(`/api/offers/${id}/resend`);
  assert.equal(resend.status, 400);
});

test('bulk XLSX ingestion creates good rows and reports bad rows by index', async () => {
  const { agent, company } = await setup();
  await SalaryStructureTemplate.create({ ...TEMPLATE, name: 'Sales-Std', companyId: company._id });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('roster');
  ws.addRow(['fullName', 'email', 'position', 'department', 'annualCTC', 'joiningDate', 'templateName']);
  ws.addRow(['Asha Rao', 'asha@example.com', 'AE', 'Sales', 800000, '2026-07-01', 'Sales-Std']);
  ws.addRow(['Bad Row', 'bad2@example.com', 'AE', 'Sales', 700000, '2026-07-01', 'Nonexistent-Template']);
  const buffer = await wb.xlsx.writeBuffer();

  const res = await agent.post('/api/offers/bulk')
    .attach('roster', Buffer.from(buffer), { filename: 'roster.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  assert.equal(res.status, 201);
  assert.equal(res.body.created.length, 1);
  assert.equal(res.body.failed.length, 1);
  assert.equal(res.body.failed[0].row, 3);
});

test('non-managers cannot access offer management', async () => {
  const { agent } = await authAgent(app, { email: 'emp@xyz.com', role: 'employee' });
  const res = await agent.get('/api/offers');
  assert.equal(res.status, 403);
});
