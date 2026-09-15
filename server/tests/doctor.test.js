import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';
import Activity from '../models/Activity.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const buildRoster = async (rows) => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Doctors');
  sheet.addRow(['Name', 'Speciality', 'Area', 'Phone', 'Assign to BDM']);
  rows.forEach((r) => sheet.addRow(r));
  return wb.xlsx.writeBuffer();
};

// ---------- Authentication / tier gating ----------

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/doctors/mine')).status, 401);
});

test('an employee with no fieldForce tier is denied both BDM and manager endpoints', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/doctors/mine')).status, 403);
  assert.equal((await agent.get('/api/doctors')).status, 403);
});

test('a BDM cannot reach the ASM+ management endpoints', async () => {
  const { agent } = await authAgent(app, { email: 'bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  assert.equal((await agent.get('/api/doctors')).status, 403);
  assert.equal((await agent.post('/api/doctors').send({ name: 'Dr. X' })).status, 403);
});

// ---------- BDM view-only ----------

test('a BDM sees only doctors assigned to them via /mine', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm2@xyz.com', password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const otherBdm = await createUser({ companyId: company._id, email: 'other-bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });

  const bdmAgent = request.agent(app);
  const login = await bdmAgent.post('/api/auth/login').send({ companySlug: company.slug, email: bdm.email, password: 'Password1' });
  assert.equal(login.status, 200);

  await asmAgent.post('/api/doctors').send({ name: 'Dr. Mine', assignedTo: String(bdm._id) });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Other', assignedTo: String(otherBdm._id) });

  const res = await bdmAgent.get('/api/doctors/mine');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Dr. Mine');
});

test('plannedVisitsThisMonth sums across ALL of the BDM\'s tour plans for that month, not just one', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-stats@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm-stats@xyz.com', password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const bdmAgent = request.agent(app);
  await bdmAgent.post('/api/auth/login').send({ companySlug: company.slug, email: bdm.email, password: 'Password1' });

  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Stats', assignedTo: String(bdm._id) });
  const doctorId = doctor.body.doctor._id;

  // Two independent tour plans in the same month, each planning this doctor once.
  await bdmAgent.post('/api/mtp').send({ month: '2026-11', plannedVisits: [{ doctorId, date: '2026-11-05' }] });
  await bdmAgent.post('/api/mtp').send({ month: '2026-11', plannedVisits: [{ doctorId, date: '2026-11-12' }] });

  const res = await bdmAgent.get('/api/doctors/mine?month=2026-11');
  assert.equal(res.status, 200);
  assert.equal(res.body.data[0].plannedVisitsThisMonth, 2, 'should sum visits across both tour plans');
});

// ---------- ASM+ create / assignment authorization ----------

test('an ASM can create an unassigned doctor', async () => {
  const { agent: asmAgent } = await authAgent(app, { email: 'asm2@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await asmAgent.post('/api/doctors').send({ name: 'Dr. Unassigned' });
  assert.equal(res.status, 201);
  assert.equal(res.body.doctor.assignedTo, null);
});

test('an ASM can assign a doctor to their own reporting BDM', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm3@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm3@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });

  const res = await asmAgent.post('/api/doctors').send({ name: 'Dr. Owned', assignedTo: String(bdm._id) });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.doctor.assignedTo), String(bdm._id));
});

test('an ASM cannot assign a doctor to a BDM outside their reporting subtree', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent } = await authAgent(app, { email: 'asm4@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const unrelatedBdm = await createUser({ companyId: company._id, email: 'unrelated-bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' } } });

  const res = await asmAgent.post('/api/doctors').send({ name: 'Dr. Blocked', assignedTo: String(unrelatedBdm._id) });
  assert.equal(res.status, 403);
});

// ---------- Reassignment + audit log ----------

test('an ASM can reassign a doctor between two of their own BDMs, and it is audit-logged', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm5@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdmA = await createUser({ companyId: company._id, email: 'bdmA@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id } });
  const bdmB = await createUser({ companyId: company._id, email: 'bdmB@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id } });

  const created = await asmAgent.post('/api/doctors').send({ name: 'Dr. Reassign', assignedTo: String(bdmA._id) });
  const doctorId = created.body.doctor._id;

  const res = await asmAgent.patch(`/api/doctors/${doctorId}`).send({ assignedTo: String(bdmB._id) });
  assert.equal(res.status, 200);
  assert.equal(String(res.body.doctor.assignedTo), String(bdmB._id));

  const activity = await Activity.findOne({ action: 'doctor.reassign', entityId: doctorId });
  assert.ok(activity, 'expected a doctor.reassign activity log entry');
});

test('an ASM cannot reassign a doctor currently owned by a BDM outside their subtree', async () => {
  const company = await getDefaultCompany();
  const { agent: otherAsmAgent, user: otherAsm } = await authAgent(app, { email: 'other-asm@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const foreignBdm = await createUser({ companyId: company._id, email: 'foreign-bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: otherAsm._id } });
  const created = await otherAsmAgent.post('/api/doctors').send({ name: 'Dr. Foreign', assignedTo: String(foreignBdm._id) });

  const { agent: asmAgent } = await authAgent(app, { email: 'asm6@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await asmAgent.patch(`/api/doctors/${created.body.doctor._id}`).send({ name: 'Hijacked' });
  assert.equal(res.status, 403);
});

// ---------- Tenant isolation ----------

test('doctors from another company never appear in this company\'s admin listing', async () => {
  const companyA = await createCompany({ slug: 'doc-alpha' });
  const companyB = await createCompany({ slug: 'doc-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const { agent: adminB } = await authAgent(app, { company: companyB, email: 'admin-b@xyz.com', role: 'admin' });

  await adminA.post('/api/doctors').send({ name: 'Dr. Alpha' });
  await adminB.post('/api/doctors').send({ name: 'Dr. Beta' });

  const res = await adminA.get('/api/doctors');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.every((d) => d.name !== 'Dr. Beta'));
  assert.ok(res.body.data.some((d) => d.name === 'Dr. Alpha'));
});

// ---------- CSV/XLSX import ----------

test('CSV import creates authorized rows and reports unauthorized rows as failed, not aborting the batch', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm7@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const ownBdm = await createUser({
    companyId: company._id, email: 'import-own-bdm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id, employeeId: 'MMS-OWN' }
  });
  const foreignBdm = await createUser({
    companyId: company._id, email: 'import-foreign-bdm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' }, employeeId: 'MMS-FOREIGN' }
  });

  const buffer = await buildRoster([
    ['Dr. ImportOk', 'Cardiologist', 'Pune', '9999999999', 'MMS-OWN'],
    ['Dr. ImportBlocked', 'Neurologist', 'Mumbai', '8888888888', 'MMS-FOREIGN']
  ]);

  const res = await asmAgent.post('/api/doctors/import').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 201);
  assert.equal(res.body.imported.length, 1);
  assert.equal(res.body.failed.length, 1);
  assert.equal(res.body.imported[0].name, 'Dr. ImportOk');
});

// ---------- Import preview/confirm ----------

test('preview reports per-row status without writing anything to the database', async () => {
  const { agent: asmAgent } = await authAgent(app, { email: 'asm-preview@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });

  const buffer = await buildRoster([
    ['', 'Cardiologist', 'Pune', '9999999999', ''], // missing name -> error
    ['Dr. PreviewNew', 'Neurologist', 'Mumbai', '8888888888', ''] // ok, unassigned
  ]);

  const res = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.error, 1);
  assert.equal(res.body.summary.ok, 1);
  assert.equal(res.body.rows.find((r) => r.name === 'Dr. PreviewNew').status, 'ok');

  const dbCount = await (await import('../models/Doctor.js')).default.countDocuments({});
  assert.equal(dbCount, 0, 'preview must not create any doctors');
});

test('preview flags a BDM identifier outside the caller\'s reporting hierarchy', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent } = await authAgent(app, { email: 'asm-preview3@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const foreignBdm = await createUser({ companyId: company._id, email: 'foreign-preview-bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' }, employeeId: 'PREV-FOREIGN' } });

  const buffer = await buildRoster([['Dr. Blocked', 'Cardiologist', 'Pune', '', 'PREV-FOREIGN']]);
  const res = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 200);
  assert.equal(res.body.rows[0].status, 'error');
  assert.match(res.body.rows[0].message, /reporting hierarchy/);
});

test('preview flags an existing doctor as a warning (update), not a duplicate create', async () => {
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-preview4@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Existing' });

  const buffer = await buildRoster([['Dr. Existing', 'Cardiologist', 'Pune', '', '']]);
  const res = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 200);
  assert.equal(res.body.rows[0].status, 'warning');
  assert.match(res.body.rows[0].message, /already exists/);
});

test('confirm creates ok rows, updates warning rows, and re-validates authorization server-side (never trusting client-supplied resolvedAssignedTo)', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-confirm@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const ownBdm = await createUser({
    companyId: company._id, email: 'confirm-own-bdm@xyz.com',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id, employeeId: 'CONF-OWN' }
  });
  const foreignBdm = await createUser({ companyId: company._id, email: 'confirm-foreign-bdm@xyz.com', employeeDetails: { fieldForce: { tier: 'BDM' }, employeeId: 'CONF-FOREIGN' } });
  const existing = await asmAgent.post('/api/doctors').send({ name: 'Dr. ConfirmUpdate' });

  const res = await asmAgent.post('/api/doctors/import/confirm').send({
    rows: [
      { row: 2, name: 'Dr. ConfirmNew', speciality: 'ENT', area: 'Pune', assignIdentifier: 'CONF-OWN' },
      { row: 3, name: 'Dr. ConfirmUpdate', speciality: 'Updated Spec', assignIdentifier: 'CONF-OWN' },
      // Client lies about resolvedAssignedTo pointing to a BDM outside the caller's hierarchy — must be rejected server-side.
      { row: 4, name: 'Dr. ConfirmHijack', assignIdentifier: 'CONF-FOREIGN', resolvedAssignedTo: String(foreignBdm._id) }
    ]
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.created.length, 1);
  assert.equal(res.body.updated.length, 1);
  assert.equal(res.body.failed.length, 1);
  assert.match(res.body.failed[0].error, /reporting hierarchy/);

  const Doctor = (await import('../models/Doctor.js')).default;
  const updatedDoc = await Doctor.findOne({ name: 'Dr. ConfirmUpdate' });
  assert.equal(updatedDoc.speciality, 'Updated Spec');
  assert.equal(String(updatedDoc.assignedTo), String(ownBdm._id));
  const hijacked = await Doctor.findOne({ name: 'Dr. ConfirmHijack' });
  assert.equal(hijacked, null, 'the unauthorized row must not have been created');
});

// ---------- Alerts ----------

test('doctor alerts surface only the caller\'s own assigned doctors with an upcoming birthday', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-alerts@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm-alerts@xyz.com', password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const bdmAgent = request.agent(app);
  const login = await bdmAgent.post('/api/auth/login').send({ companySlug: company.slug, email: bdm.email, password: 'Password1' });
  assert.equal(login.status, 200);

  const today = new Date();
  const soon = new Date(Date.UTC(1990, today.getUTCMonth(), today.getUTCDate()));

  await asmAgent.post('/api/doctors').send({ name: 'Dr. Birthday', assignedTo: String(bdm._id), dob: soon.toISOString() });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. NoAlert', assignedTo: String(bdm._id) });

  const res = await bdmAgent.get('/api/doctors/alerts');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Dr. Birthday');
  assert.equal(res.body.data[0].type, 'birthday');
});
