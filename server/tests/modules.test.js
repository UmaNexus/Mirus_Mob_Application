import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent } from './helpers/factories.js';
import { getOutbox, clearOutbox } from '../services/emailService.js';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { computeStatutoryDeductions, computePF } from '../utils/statutoryEngine.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

// Shared setup: an admin (all permissions) and an employee in the same company.
const setup = async () => {
  const { agent: admin } = await authAgent(app, { email: 'admin@xyz.com', role: 'admin' });
  const { agent: emp, user: employee } = await authAgent(app, { email: 'emp@xyz.com', role: 'employee' });
  return { admin, emp, employee };
};

test('Epic 11 — attendance mark + leave apply/approve + holiday', async () => {
  const { admin, emp, employee } = await setup();

  assert.equal((await emp.post('/api/attendance/mark').send({ date: '2026-07-01', status: 'Present' })).status, 200);
  assert.equal((await admin.get('/api/attendance').query({ userId: String(employee._id) })).body.data.length, 1);

  const leave = await emp.post('/api/leaves').send({ type: 'Casual', fromDate: '2026-07-10', toDate: '2026-07-11', reason: 'Personal' });
  assert.equal(leave.status, 201);
  const decided = await admin.patch(`/api/leaves/${leave.body.leave._id}/decision`).send({ status: 'Approved' });
  assert.equal(decided.body.leave.status, 'Approved');

  assert.equal((await admin.post('/api/holidays').send({ date: '2026-08-15', name: 'Independence Day' })).status, 201);
  assert.equal((await emp.get('/api/holidays').query({ year: 2026 })).body.data.length, 1);
});

test('Epic C — company config: admin can update, HR cannot', async () => {
  const { admin } = await setup();
  const { agent: hr } = await authAgent(app, { email: 'hr@xyz.com', role: 'hr' });

  assert.equal((await admin.get('/api/company')).status, 200);
  const upd = await admin.put('/api/company').send({ statutory: { gstin: '29ABCDE1234F1Z5', cin: 'U12345KA2020PTC000001' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.company.statutory.gstin, '29ABCDE1234F1Z5');
  assert.equal(upd.body.company.statutory.cin, 'U12345KA2020PTC000001');

  const hrUpd = await admin.put('/api/company').send({
    hr: { name: 'Y. Mounica', designation: 'HR Manager', contact: '9000278520', email: 'hr@xyz.com' }
  });
  assert.equal(hrUpd.status, 200);
  assert.equal(hrUpd.body.company.hr.name, 'Y. Mounica');
  assert.equal(hrUpd.body.company.hr.email, 'hr@xyz.com');

  // Branding asset view endpoint rejects missing assets cleanly.
  const missingAsset = await admin.get('/api/company/asset/logo');
  assert.equal(missingAsset.status, 404);

  assert.equal((await hr.put('/api/company').send({ name: 'Hacked' })).status, 403); // HR lacks company:manage
});

test('Epic 10 — issue a handbook doc and employee acknowledges', async () => {
  const { admin, emp, employee } = await setup();
  const issued = await admin.post('/api/employee-docs').send({ userId: employee._id, type: 'Handbook' });
  assert.equal(issued.status, 201);
  assert.equal(issued.body.document.status, 'issued');

  const ack = await emp.post(`/api/employee-docs/${issued.body.document._id}/acknowledge`).send({ agree: true });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.document.status, 'acknowledged');

  assert.equal((await emp.get('/api/employee-docs/mine')).body.data.length, 1);
});

test('Epic 17 — uploadable doc type (read) + upload + accept', async () => {
  const { admin, emp, employee } = await setup();
  const type = await admin.post('/api/uploaded-docs/types').send({ name: 'Form 16', section: 'Tax', kind: 'read', termsText: 'Please confirm receipt.' });
  assert.equal(type.status, 201);

  const pdf = Buffer.from('%PDF-1.4 test');
  const uploaded = await admin.post('/api/uploaded-docs')
    .field('userId', String(employee._id))
    .field('documentTypeId', String(type.body.type._id))
    .attach('document', pdf, { filename: 'form16.pdf', contentType: 'application/pdf' });
  assert.equal(uploaded.status, 201);

  const accept = await emp.post(`/api/uploaded-docs/${uploaded.body.record._id}/accept`).send({ agree: true });
  assert.equal(accept.status, 200);
  assert.equal(accept.body.record.status, 'acknowledged');
});

test('Epic 12 — performance review published is visible to the employee', async () => {
  const { admin, emp, employee } = await setup();
  const review = await admin.post('/api/performance/reviews').send({
    userId: employee._id, period: 'Q1-2026', overallRating: 4, status: 'Published',
    kpis: [{ title: 'Delivery', target: '100%', achieved: '95%', score: 4 }]
  });
  assert.equal(review.status, 201);
  assert.equal((await emp.get('/api/performance/reviews/mine')).body.data.length, 1);
});

test('Epic 12 addendum — incentive/appraisal attachment upload, streaming and access control', async () => {
  const { admin, emp, employee } = await setup();
  const { agent: other } = await authAgent(app, { email: 'other@xyz.com', role: 'employee' });
  const pdf = Buffer.from('%PDF-1.4 test');

  const incentive = await admin.post('/api/performance/incentives')
    .field('userId', String(employee._id)).field('period', 'Q1-2026').field('amount', '500000')
    .attach('document', pdf, { filename: 'incentive-memo.pdf', contentType: 'application/pdf' });
  assert.equal(incentive.status, 201);
  assert.ok(incentive.body.incentive.attachmentFileId);
  assert.equal(incentive.body.incentive.attachmentFileName, 'incentive-memo.pdf');

  const appraisal = await admin.post('/api/performance/appraisals')
    .field('userId', String(employee._id)).field('effectiveDate', '2026-04-01').field('newDesignation', 'Senior Engineer')
    .attach('document', pdf, { filename: 'promotion-letter.pdf', contentType: 'application/pdf' });
  assert.equal(appraisal.status, 201);
  assert.ok(appraisal.body.appraisal.attachmentFileId);

  // Owner and HR (performance:manage) can stream; an unrelated employee cannot.
  assert.equal((await emp.get(`/api/performance/incentives/${incentive.body.incentive._id}/attachment`)).status, 200);
  assert.equal((await admin.get(`/api/performance/appraisals/${appraisal.body.appraisal._id}/attachment`)).status, 200);
  assert.equal((await other.get(`/api/performance/incentives/${incentive.body.incentive._id}/attachment`)).status, 403);

  // A record with no attachment 404s cleanly.
  const bare = await admin.post('/api/performance/incentives')
    .field('userId', String(employee._id)).field('period', 'Q2-2026').field('amount', '100000');
  assert.equal((await emp.get(`/api/performance/incentives/${bare.body.incentive._id}/attachment`)).status, 404);

  // Employee sees their own promotion history.
  assert.equal((await emp.get('/api/performance/appraisals/mine')).body.data.length, 1);
});

test('Epic 18 — training section create + list', async () => {
  const { admin, emp } = await setup();
  assert.equal((await admin.post('/api/training/sections').send({ title: 'Onboarding' })).status, 201);
  assert.equal((await emp.get('/api/training/sections')).body.data.length, 1);
});

test('Epic 13 — asset register: assign then return', async () => {
  const { admin, emp, employee } = await setup();
  const asset = await admin.post('/api/assets').send({ tag: 'LAP-001', type: 'Laptop' });
  assert.equal(asset.status, 201);

  const assigned = await admin.post(`/api/assets/${asset.body.asset._id}/assign`).send({ userId: employee._id });
  assert.equal(assigned.body.asset.status, 'Assigned');
  assert.equal((await emp.get('/api/assets/mine')).body.data.length, 1);

  const returned = await admin.post(`/api/assets/${asset.body.asset._id}/return`).send({ condition: 'Good' });
  assert.equal(returned.body.asset.status, 'Returned');
});

test('Epic 14 — exit initiate + generate letters', async () => {
  const { admin, employee } = await setup();
  const exit = await admin.post('/api/exits').send({ userId: employee._id, resignationDate: '2026-07-01', lastWorkingDay: '2026-07-31', reason: 'Growth' });
  assert.equal(exit.status, 201);
  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`);
  assert.equal(letters.status, 200);
  assert.ok(letters.body.relievingLetterUrl && letters.body.experienceLetterUrl);
});

test('Employee 360 — admin gets a consolidated section-wise overview', async () => {
  const { admin, emp, employee } = await setup();
  // Seed a couple of sections' data.
  await emp.post('/api/attendance/mark').send({ date: '2026-07-01', status: 'Present' });
  await admin.post('/api/performance/reviews').send({ userId: employee._id, period: 'Q1-2026', overallRating: 4, status: 'Published' });

  const res = await admin.get(`/api/users/${employee._id}/overview`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user._id, String(employee._id));
  // Every section key is present.
  for (const k of ['compensation', 'payslips', 'attendance', 'leaves', 'performance', 'assets', 'documents', 'exit']) {
    assert.ok(k in res.body, `overview missing section: ${k}`);
  }
  assert.equal(res.body.attendance.length, 1);
  assert.equal(res.body.performance.reviews.length, 1);

  // Employees cannot use the admin overview endpoint.
  assert.equal((await emp.get(`/api/users/${employee._id}/overview`)).status, 403);
});

test('Letter templates — set up offer/appointment/service/FNF templates with PDF view', async () => {
  const { admin, emp } = await setup();
  const created = await admin.post('/api/letter-templates').send({
    type: 'FNFLetter', name: 'Standard FNF', title: 'Full & Final Settlement',
    bodyParagraphs: ['Dear {{employeeName}}, your full and final settlement is enclosed.'],
    isDefault: true
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.template.isDefault, true);

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const withFile = await admin
    .post('/api/letter-templates')
    .field('type', 'OfferLetter')
    .field('name', 'Default Offer')
    .field('title', 'Offer of Employment')
    .field('isDefault', 'true')
    .attach('file', pdf, { filename: 'offer.pdf', contentType: 'application/pdf' });
  assert.equal(withFile.status, 201);
  assert.equal(withFile.body.template.hasFile, true);

  const file = await admin.get(`/api/letter-templates/${withFile.body.template._id}/file`);
  assert.equal(file.status, 200);

  const list = await admin.get('/api/letter-templates');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 2);
  assert.ok(list.body.meta.types.includes('ServiceLetter'));
  assert.ok(list.body.meta.placeholders.includes('employeeName'));

  // Employees cannot manage letter templates.
  assert.equal((await emp.get('/api/letter-templates')).status, 403);
});

test('Letter templates — newest FNF upload and newest create become the default template', async () => {
  const { admin, emp } = await setup();

  const first = await admin.post('/api/letter-templates').send({
    type: 'FNFLetter', name: 'Legacy FNF', title: 'Legacy Full & Final Settlement',
    bodyParagraphs: ['Dear {{employeeName}}, your full and final settlement is enclosed.'],
    isDefault: true
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.template.isDefault, true);

  const created = await admin.post('/api/letter-templates').send({
    type: 'FNFLetter', name: 'Standard FNF', title: 'Full & Final Settlement',
    bodyParagraphs: ['Dear {{employeeName}}, your full and final settlement is enclosed.']
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.template.isDefault, true);

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const uploaded = await admin
    .post('/api/letter-templates')
    .field('type', 'FNFLetter')
    .field('name', 'Uploaded FNF Template')
    .field('title', 'FULL & FINAL SETTLEMENT')
    .attach('file', pdf, { filename: 'uploaded-fnf.pdf', contentType: 'application/pdf' });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.template.isDefault, true);

  const list = await admin.get('/api/letter-templates').query({ type: 'FNFLetter' });
  const defaultTpl = list.body.data.find((t) => t.isDefault);
  assert.ok(defaultTpl, 'there should be a default FNF template');

  const newest = await admin.post('/api/letter-templates').send({
    type: 'FNFLetter', name: 'Newest FNF', title: 'Newest Full & Final Settlement',
    bodyParagraphs: ['Dear {{employeeName}}, this is the latest FNF.']
  });
  assert.equal(newest.status, 201);
  assert.equal(newest.body.template.isDefault, true);

  const list2 = await admin.get('/api/letter-templates').query({ type: 'FNFLetter' });
  const newestDefault = list2.body.data.find((t) => t.isDefault);
  assert.equal(newestDefault.name, 'Newest FNF');

  assert.equal((await emp.get('/api/letter-templates')).status, 403);
});

test('Epic 14b — generate FNF letter and email', async () => {
  const { admin, employee } = await setup();
  await clearOutbox();
  // Ensure a default FNFLetter template exists for this company
  const created = await admin.post('/api/letter-templates').send({
    type: 'FNFLetter', name: 'Standard FNF For Test', title: 'Full & Final Settlement',
    bodyParagraphs: ['Dear {{employeeName}}, your full and final settlement is enclosed.'],
    isDefault: true
  });
  assert.equal(created.status, 201);

  const exit = await admin.post('/api/exits').send({ userId: employee._id, resignationDate: '2026-08-01', lastWorkingDay: '2026-08-15', reason: 'Resignation' });
  assert.equal(exit.status, 201);
  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`);
  assert.equal(letters.status, 200);
  assert.ok(letters.body.relievingLetterUrl && letters.body.experienceLetterUrl);

  const rec = await admin.get(`/api/exits/${exit.body.record._id}`);
  assert.equal(rec.status, 200);
  assert.ok(rec.body.record.fnfLetterUrl, 'fnfLetterUrl persisted on ExitRecord');

  const out = getOutbox();
  assert.ok(out.some((o) => String(o.to).includes(employee.email) || /Full & Final|Full and Final/i.test(o.subject || o.body)), 'outbox contains FNF email');
});

test('FNF pdfs are saved under generated docs, not offers', async () => {
  const { admin, employee } = await setup();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Employee: {{employeeName}}', { x: 50, y: 780, size: 12, font });
  page.drawText('Amount: {{amount}}', { x: 50, y: 760, size: 12, font });
  page.drawText('Reason: {{reason}}', { x: 50, y: 740, size: 12, font });
  page.drawText('Last working day: {{lastWorkingDay}}', { x: 50, y: 720, size: 12, font });
  const pdfBytes = await doc.save();

  await admin
    .post('/api/letter-templates')
    .field('type', 'FNFLetter')
    .field('name', 'Generated-doc FNF Template')
    .field('title', 'FULL & FINAL SETTLEMENT')
    .field('isDefault', 'true')
    .attach('file', Buffer.from(pdfBytes), { filename: 'generated-doc-fnf.pdf', contentType: 'application/pdf' });

  const exit = await admin.post('/api/exits').send({
    userId: employee._id,
    resignationDate: '2026-08-01',
    lastWorkingDay: '2026-08-15',
    reason: 'Resignation'
  });

  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`).send({
    fnfFields: {
      amount: '75000',
      lastWorkingDay: '2026-08-20',
      reason: 'Better opportunity'
    }
  });
  assert.equal(letters.status, 200);

  const record = await admin.get(`/api/exits/${exit.body.record._id}`);
  assert.ok(record.body.record.fnfLetterUrl, 'fnfLetterUrl should be created');
  assert.match(record.body.record.fnfLetterUrl, /\/uploads\/documents\/generated\//, 'FNF PDF should be stored in generated documents folder');
  assert.doesNotMatch(record.body.record.fnfLetterUrl, /\/uploads\/offers\//, 'FNF PDF should not be stored in offers folder');
});

test('FNF preview generates without emailing the employee', async () => {
  const { admin, employee } = await setup();
  await clearOutbox();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Employee: {{employeeName}}', { x: 50, y: 780, size: 12, font });
  page.drawText('Amount: {{amount}}', { x: 50, y: 760, size: 12, font });
  page.drawText('Reason: {{reason}}', { x: 50, y: 740, size: 12, font });
  page.drawText('Last working day: {{lastWorkingDay}}', { x: 50, y: 720, size: 12, font });
  const pdfBytes = await doc.save();

  await admin
    .post('/api/letter-templates')
    .field('type', 'FNFLetter')
    .field('name', 'Preview FNF Template')
    .field('title', 'FULL & FINAL SETTLEMENT')
    .field('isDefault', 'true')
    .attach('file', Buffer.from(pdfBytes), { filename: 'preview-fnf.pdf', contentType: 'application/pdf' });

  const exit = await admin.post('/api/exits').send({
    userId: employee._id,
    resignationDate: '2026-08-01',
    lastWorkingDay: '2026-08-15',
    reason: 'Resignation'
  });

  const preview = await admin.post(`/api/exits/${exit.body.record._id}/letters`).send({
    previewOnly: true,
    fnfFields: {
      amount: '75000',
      lastWorkingDay: '2026-08-20',
      reason: 'Better opportunity'
    }
  });
  assert.equal(preview.status, 200);
  assert.ok(preview.body.previewLetterUrl, 'preview should return a document URL');
  assert.equal(preview.body.fnfLetterUrl, null, 'preview should not mark the letter as issued');

  const outbox = getOutbox();
  assert.equal(outbox.length, 0, 'preview should not email the employee');
});

test('FNF template PDF placeholders are filled with employee, amount and reason', async () => {
  const { admin, employee } = await setup();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Employee: {{employeeName}}', { x: 50, y: 780, size: 12, font });
  page.drawText('Amount: {{amount}}', { x: 50, y: 760, size: 12, font });
  page.drawText('Reason: {{reason}}', { x: 50, y: 740, size: 12, font });
  page.drawText('Last working day: {{lastWorkingDay}}', { x: 50, y: 720, size: 12, font });
  const pdfBytes = await doc.save();

  const created = await admin
    .post('/api/letter-templates')
    .field('type', 'FNFLetter')
    .field('name', 'Placeholder FNF Template')
    .field('title', 'FULL & FINAL SETTLEMENT')
    .field('isDefault', 'true')
    .attach('file', Buffer.from(pdfBytes), { filename: 'fnf-placeholder.pdf', contentType: 'application/pdf' });
  assert.equal(created.status, 201);

  const exit = await admin.post('/api/exits').send({
    userId: employee._id,
    resignationDate: '2026-08-01',
    lastWorkingDay: '2026-08-15',
    reason: 'Resignation'
  });
  assert.equal(exit.status, 201);

  const updated = await admin.patch(`/api/exits/${exit.body.record._id}`).send({
    fnfSettlement: { amount: 25000000, status: 'Pending' }
  });
  assert.equal(updated.status, 200);

  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`);
  assert.equal(letters.status, 200);

  const record = await admin.get(`/api/exits/${exit.body.record._id}`);
  assert.ok(record.body.record.fnfLetterUrl, 'fnfLetterUrl should be created');

  const pdfPath = new URL(record.body.record.fnfLetterUrl, `file://${process.cwd()}/`).pathname;
  const pdf = await getDocumentProxy(new Uint8Array(await import('node:fs/promises').then((m) => m.readFile(pdfPath))));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = String(extracted?.text || '');
  assert.match(text, /Employee:\s*.*emp/i);
  assert.match(text, /Amount:\s*.*INR\s*2,50,000\.00|Amount:\s*.*2,50,000\.00/i);
  assert.match(text, /Reason:\s*Resignation/i);
});

test('FNF PDF generation does not duplicate values when label + placeholder appear on one line', async () => {
  const { admin, employee } = await setup();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Employee Name: {{employeeName}}', { x: 50, y: 780, size: 12, font });
  page.drawText('Amount: _________', { x: 50, y: 760, size: 12, font });
  page.drawText('Reason: {{reason}}', { x: 50, y: 740, size: 12, font });
  page.drawText('Last Working Day: _________', { x: 50, y: 720, size: 12, font });
  const pdfBytes = await doc.save();

  await admin
    .post('/api/letter-templates')
    .field('type', 'FNFLetter')
    .field('name', 'No-duplicate FNF Template')
    .field('title', 'FULL & FINAL SETTLEMENT')
    .field('isDefault', 'true')
    .attach('file', Buffer.from(pdfBytes), { filename: 'no-duplicate-fnf.pdf', contentType: 'application/pdf' });

  const exit = await admin.post('/api/exits').send({
    userId: employee._id,
    resignationDate: '2026-08-01',
    lastWorkingDay: '2026-08-15',
    reason: 'Resignation'
  });

  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`).send({
    fnfFields: {
      amount: '75000',
      lastWorkingDay: '2026-08-20',
      reason: 'Better opportunity'
    }
  });
  assert.equal(letters.status, 200);

  const record = await admin.get(`/api/exits/${exit.body.record._id}`);
  const pdfPath = new URL(record.body.record.fnfLetterUrl, `file://${process.cwd()}/`).pathname;
  const pdf = await getDocumentProxy(new Uint8Array(await import('node:fs/promises').then((m) => m.readFile(pdfPath))));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = String(extracted?.text || '');
  assert.match(text, /Employee Name:\s*.*emp/i);
  assert.doesNotMatch(text, /Employee Name:\s*.*emp.*emp/i);
  assert.match(text, /Amount:\s*.*75,000|Amount:\s*.*INR/i);
  assert.doesNotMatch(text, /Amount:\s*.*75,000.*75,000|Amount:\s*.*INR.*INR/i);
});

test('FNF uploaded PDF with blank label fields fills employee values before issuing', async () => {
  const { admin, employee } = await setup();
  await clearOutbox();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Employee Name: ______________________', { x: 50, y: 780, size: 12, font });
  page.drawText('Amount: ______________________', { x: 50, y: 760, size: 12, font });
  page.drawText('Reason: ______________________', { x: 50, y: 740, size: 12, font });
  page.drawText('Last Working Day: ______________________', { x: 50, y: 720, size: 12, font });
  const pdfBytes = await doc.save();

  await admin
    .post('/api/letter-templates')
    .field('type', 'FNFLetter')
    .field('name', 'Blank-field FNF Template')
    .field('title', 'FULL & FINAL SETTLEMENT')
    .field('isDefault', 'true')
    .attach('file', Buffer.from(pdfBytes), { filename: 'blank-field-fnf.pdf', contentType: 'application/pdf' });

  const exit = await admin.post('/api/exits').send({
    userId: employee._id,
    resignationDate: '2026-08-01',
    lastWorkingDay: '2026-08-15',
    reason: 'Resignation'
  });

  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`).send({
    fnfFields: {
      amount: '75000',
      lastWorkingDay: '2026-08-20',
      reason: 'Better opportunity'
    }
  });
  assert.equal(letters.status, 200);

  const record = await admin.get(`/api/exits/${exit.body.record._id}`);
  const pdfPath = new URL(record.body.record.fnfLetterUrl, `file://${process.cwd()}/`).pathname;
  const pdf = await getDocumentProxy(new Uint8Array(await import('node:fs/promises').then((m) => m.readFile(pdfPath))));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = String(extracted?.text || '');
  assert.match(text, /Employee Name:\s*.*emp/i);
  assert.match(text, /Amount:\s*.*75,000|Amount:\s*.*INR/i);
  assert.match(text, /Reason:\s*Better opportunity/i);
  assert.match(text, /Last Working Day:\s*.*2026-08-20|Last Working Day:\s*.*20.*Aug.*2026/i);
});

test('FNF letter accepts user-entered settlement values before issuing', async () => {
  const { admin, employee } = await setup();
  await clearOutbox();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Employee: {{employeeName}}', { x: 50, y: 780, size: 12, font });
  page.drawText('Amount: {{amount}}', { x: 50, y: 760, size: 12, font });
  page.drawText('Reason: {{reason}}', { x: 50, y: 740, size: 12, font });
  page.drawText('Last working day: {{lastWorkingDay}}', { x: 50, y: 720, size: 12, font });
  const pdfBytes = await doc.save();

  await admin
    .post('/api/letter-templates')
    .field('type', 'FNFLetter')
    .field('name', 'Prompted FNF Template')
    .field('title', 'FULL & FINAL SETTLEMENT')
    .field('isDefault', 'true')
    .attach('file', Buffer.from(pdfBytes), { filename: 'prompted-fnf.pdf', contentType: 'application/pdf' });

  const exit = await admin.post('/api/exits').send({
    userId: employee._id,
    resignationDate: '2026-08-01',
    lastWorkingDay: '2026-08-15',
    reason: 'Resignation'
  });

  const letters = await admin.post(`/api/exits/${exit.body.record._id}/letters`).send({
    fnfFields: {
      amount: '75000',
      lastWorkingDay: '2026-08-20',
      reason: 'Better opportunity'
    }
  });
  assert.equal(letters.status, 200);

  const record = await admin.get(`/api/exits/${exit.body.record._id}`);
  const pdfPath = new URL(record.body.record.fnfLetterUrl, `file://${process.cwd()}/`).pathname;
  const pdf = await getDocumentProxy(new Uint8Array(await import('node:fs/promises').then((m) => m.readFile(pdfPath))));
  const extracted = await extractText(pdf, { mergePages: true });
  const text = String(extracted?.text || '');
  assert.match(text, /Amount:\s*.*INR\s*75,000\.00|Amount:\s*.*75,000\.00/i);
  assert.match(text, /Reason:\s*Better opportunity/i);
  assert.match(text, /Last working day:\s*.*20.*Aug.*2026|Last working day:\s*.*2026-08-20/i);

  const outbox = getOutbox();
  assert.ok(outbox.some((o) => String(o.to).includes(employee.email)), 'FNF email should be sent to the employee email');
});

test('C&F templates — create agent with PDF upload', async () => {
  const { admin, emp } = await setup();

  // Minimal PDF header so multer/file filter accepts it.
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  const created = await admin
    .post('/api/cf-templates')
    .field('type', 'CFAgent')
    .field('name', 'C&F Agency Agreement')
    .field('description', 'Test agent template')
    .attach('file', pdf, { filename: 'cf-agent.pdf', contentType: 'application/pdf' });
  assert.equal(created.status, 201);
  assert.equal(created.body.template.type, 'CFAgent');
  assert.equal(created.body.template.hasFile, true);

  const list = await admin.get('/api/cf-templates');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.ok(list.body.meta.types.includes('CFAgent'));
  assert.equal(list.body.meta.types.length, 1);

  const file = await admin.get(`/api/cf-templates/${created.body.template._id}/file`);
  assert.equal(file.status, 200);

  assert.equal((await emp.get('/api/cf-templates')).status, 403);
});

test('C&F issue — fill blanks, generate PDF and queue email', async () => {
  const { admin } = await setup();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const tpl = await admin
    .post('/api/cf-templates')
    .field('type', 'CFAgent')
    .field('name', 'C&F Agency Standard')
    .attach('file', pdf, { filename: 'agent.pdf', contentType: 'application/pdf' });
  assert.equal(tpl.status, 201);

  const fieldsMeta = await admin.get('/api/cf-issues/fields').query({ type: 'CFAgent' });
  assert.equal(fieldsMeta.status, 200);
  assert.ok(fieldsMeta.body.fields.some((f) => f.key === 'partyName'));
  assert.ok(fieldsMeta.body.fields.some((f) => f.key === 'recipientEmail'));

  const issued = await admin.post('/api/cf-issues').send({
    templateId: tpl.body.template._id,
    fields: {
      recipientEmail: 'partner@example.com',
      partyName: 'Acme Pharma Distributors',
      partyAddress: '12 Road, Hyderabad',
      territory: 'Telangana'
    }
  });
  assert.equal(issued.status, 201);
  assert.ok(issued.body.issue.pdfFileUrl);
  assert.equal(issued.body.issue.recipientEmail, 'partner@example.com');
  assert.ok(issued.body.issue.fieldValues.agreementDay);
  assert.ok(issued.body.issue.fieldValues.agreementMonth);
  assert.ok(['generated', 'sent', 'failed'].includes(issued.body.issue.status));

  const list = await admin.get('/api/cf-issues');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);

  const dl = await admin.get(`/api/cf-issues/${issued.body.issue._id}/pdf`);
  assert.equal(dl.status, 200);

  // Test action: 'download' without recipientEmail
  const downloaded = await admin.post('/api/cf-issues').send({
    templateId: tpl.body.template._id,
    action: 'download',
    fields: {
      partyName: 'Direct Download Partner',
      partyAddress: 'Road 5, Bengaluru',
      territory: 'Karnataka'
    }
  });
  assert.equal(downloaded.status, 201);
  assert.equal(downloaded.body.issue.status, 'generated');
  assert.ok(downloaded.body.issue.pdfFileUrl);
  const dl2 = await admin.get(`/api/cf-issues/${downloaded.body.issue._id}/pdf`);
  assert.equal(dl2.status, 200);
});

test('C&F issue — uploaded multi-page template preserves pages and appends schedule', async () => {
  const { admin } = await setup();
  const testDoc = await PDFDocument.create();
  testDoc.addPage([600, 800]);
  testDoc.addPage([600, 800]);
  testDoc.addPage([600, 800]);
  const pdfBytes = Buffer.from(await testDoc.save());

  const tpl = await admin
    .post('/api/cf-templates')
    .field('type', 'CFAgent')
    .field('name', 'C&F 3-Page Agreement')
    .attach('file', pdfBytes, { filename: 'custom_cf.pdf', contentType: 'application/pdf' });
  assert.equal(tpl.status, 201);

  const issued = await admin.post('/api/cf-issues').send({
    templateId: tpl.body.template._id,
    action: 'download',
    fields: {
      partyName: 'Apex Healthcare Agency',
      partyAddress: 'Plot 88, Genome Valley, Hyderabad',
      territory: 'Andhra Pradesh'
    }
  });
  assert.equal(issued.status, 201);
  assert.ok(issued.body.issue.pdfFileUrl);

  const dl = await admin.get(`/api/cf-issues/${issued.body.issue._id}/pdf`);
  assert.equal(dl.status, 200);

  const parsed = await PDFDocument.load(dl.body);
  assert.equal(parsed.getPageCount(), 4); // 3 original template pages + 1 Schedule page!
});

test('Bulk attendance — mark many employees for a day in one call', async () => {
  const { admin } = await setup();
  const { user: a } = await authAgent(app, { email: 'a@xyz.com', role: 'employee' });
  const { user: b } = await authAgent(app, { email: 'b@xyz.com', role: 'employee' });

  const res = await admin.post('/api/attendance/bulk').send({ userIds: [String(a._id), String(b._id)], date: '2026-07-05', status: 'Present' });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 2);
  assert.equal((await admin.get('/api/attendance').query({ userId: String(a._id) })).body.data.length, 1);
});

test('Bulk attendance — import from an .xlsx roster (by employeeId/email)', async () => {
  const { admin } = await setup();
  const { user } = await authAgent(app, { email: 'imp@xyz.com', role: 'employee', employeeDetails: { employeeId: 'MMS90001' } });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['employeeId', 'email', 'date', 'status', 'checkIn', 'checkOut']);
  ws.addRow(['MMS90001', '', '2026-07-05', 'Present', '09:30', '18:30']);
  ws.addRow(['', 'imp@xyz.com', '2026-07-06', 'Half-Day', '', '']);
  ws.addRow(['NOPE999', '', '2026-07-07', 'Present', '', '']); // unknown → failed row
  const buffer = await wb.xlsx.writeBuffer();

  const res = await admin.post('/api/attendance/bulk-upload')
    .attach('roster', Buffer.from(buffer), { filename: 'att.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(res.status, 201);
  assert.equal(res.body.imported.length, 2);
  assert.equal(res.body.failed.length, 1);
  assert.equal((await admin.get('/api/attendance').query({ userId: String(user._id) })).body.data.length, 2);
});

test('Bulk attendance — Mirus matrix import (P/A/L, empty skipped)', async () => {
  const { admin } = await setup();
  await authAgent(app, {
    email: 'mirus1@xyz.com',
    role: 'employee',
    employeeDetails: { employeeId: 'MMS0011' },
    personalDetails: { firstName: 'Ravinder', lastName: 'T' }
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('JULY');
  ws.addRow(['COMPANY - STAFF ATTENDANCE FOR THE MONTH OF JULY 2026']);
  ws.addRow(['S.No.', 'Emp.Id', 'Name of The Employee', 'Contact No.', 'WED', 'THUR', 'FRI', 'SAT', 'PD', 'AD', 'TD']);
  ws.addRow(['', '', '', '', 1, 2, 3, 4, '', '', '']);
  // P, A, empty (skip), L
  ws.addRow([1, 'MMS0011', 'Ravinder T', '93978 17795', 'P', 'A', '', 'L', 2, 1, 3]);
  const buffer = await wb.xlsx.writeBuffer();

  const res = await admin.post('/api/attendance/bulk-upload')
    .attach('roster', Buffer.from(buffer), { filename: 'mirus.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(res.status, 201);
  assert.equal(res.body.format, 'mirus');
  assert.equal(res.body.imported.length, 3);
  assert.ok(res.body.skippedEmpty >= 1);
  const statuses = res.body.imported.map((i) => i.status).sort();
  assert.deepEqual(statuses, ['Absent', 'Leave', 'Present']);
});

test('Epic 16 — statutory engine computes PF/ESI/PT/TDS', () => {
  // Basic ₹45,000 => PF = 12% of min(45000,15000) = ₹1,800 = 180000 paisa.
  assert.equal(computePF(4_500_000), 180_000);
  const { deductions } = computeStatutoryDeductions({ basicPaisa: 4_500_000, grossPaisa: 10_000_000, absentDays: 0, workingDays: 30 });
  const labels = deductions.map((d) => d.label);
  assert.ok(labels.includes('Provident Fund (PF)'));
  assert.ok(labels.includes('Professional Tax'));
  assert.ok(labels.includes('TDS'));
});
