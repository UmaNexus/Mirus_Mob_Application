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

/**
 * Mirrors the real official MIRUS Doctor List format: a blank first row,
 * headers on row 2, and the full official column set/order (only
 * DrName/Location/Employee ID/Speciality-Prac/Mobile No/DOB/DOA map to the
 * existing Doctor schema — every other column is present, exactly like the
 * real file, to prove they are safely ignored rather than accidentally
 * misread as something else).
 */
const buildOfficialRoster = async (rows) => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  sheet.addRow([]);
  sheet.addRow([
    'SL No.', 'DrName', 'Location', 'Employee ID', 'BDM Name', 'Manager Location', 'Manager Name',
    'Station Code', 'HQ/EX/OS', 'Reg No', 'Gender', 'Class', 'Speciality/Prac', 'VF', 'DOB', 'DOA',
    'Marital Status', 'Address', 'Address Type', 'City', 'State', 'PinCode', 'Email', 'Mobile No'
  ]);
  rows.forEach((r) => sheet.addRow(r));
  return wb.xlsx.writeBuffer();
};

// ---------- Authentication / tier gating ----------

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/doctors/mine')).status, 401);
});

test('an employee with no field-force role is denied both BDM and manager endpoints', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/doctors/mine')).status, 403);
  assert.equal((await agent.get('/api/doctors')).status, 403);
});

test('a BDM cannot reach the ASM+ management endpoints', async () => {
  const { agent } = await authAgent(app, { email: 'bdm@xyz.com', employeeDetails: { fieldRole: 'BDM' } });
  assert.equal((await agent.get('/api/doctors')).status, 403);
  assert.equal((await agent.post('/api/doctors').send({ name: 'Dr. X' })).status, 403);
});

// ---------- BDM view-only ----------

test('a BDM sees only doctors assigned to them via /mine', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm2@xyz.com', password: 'Password1',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id }
  });
  const otherBdm = await createUser({ companyId: company._id, email: 'other-bdm@xyz.com', employeeDetails: { fieldRole: 'BDM' } });

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

test('GET /api/doctors/mine no longer computes plannedVisitsThisMonth — MTP plans an area, never a doctor, so there is nothing per-doctor to sum', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-stats@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm-stats@xyz.com', password: 'Password1',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id }
  });
  const bdmAgent = request.agent(app);
  await bdmAgent.post('/api/auth/login').send({ companySlug: company.slug, email: bdm.email, password: 'Password1' });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Stats', assignedTo: String(bdm._id) });

  const res = await bdmAgent.get('/api/doctors/mine?month=2026-11');
  assert.equal(res.status, 200);
  assert.equal(res.body.data[0].plannedVisitsThisMonth, undefined, 'plannedVisitsThisMonth no longer exists — MTP is area-based, not doctor-based');
});

// ---------- ASM+ create / assignment authorization ----------

test('an ASM can create an unassigned doctor', async () => {
  const { agent: asmAgent } = await authAgent(app, { email: 'asm2@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const res = await asmAgent.post('/api/doctors').send({ name: 'Dr. Unassigned' });
  assert.equal(res.status, 201);
  assert.equal(res.body.doctor.assignedTo, null);
});

test('an ASM can assign a doctor to their own reporting BDM', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm3@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm3@xyz.com',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id }
  });

  const res = await asmAgent.post('/api/doctors').send({ name: 'Dr. Owned', assignedTo: String(bdm._id) });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.doctor.assignedTo), String(bdm._id));
});

test('an ASM cannot assign a doctor to a BDM outside their reporting subtree', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent } = await authAgent(app, { email: 'asm4@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const unrelatedBdm = await createUser({ companyId: company._id, email: 'unrelated-bdm@xyz.com', employeeDetails: { fieldRole: 'BDM' } });

  const res = await asmAgent.post('/api/doctors').send({ name: 'Dr. Blocked', assignedTo: String(unrelatedBdm._id) });
  assert.equal(res.status, 403);
});

// ---------- Reassignment + audit log ----------

test('an ASM can reassign a doctor between two of their own BDMs, and it is audit-logged', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm5@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const bdmA = await createUser({ companyId: company._id, email: 'bdmA@xyz.com', employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id } });
  const bdmB = await createUser({ companyId: company._id, email: 'bdmB@xyz.com', employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id } });

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
  const { agent: otherAsmAgent, user: otherAsm } = await authAgent(app, { email: 'other-asm@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const foreignBdm = await createUser({ companyId: company._id, email: 'foreign-bdm@xyz.com', employeeDetails: { fieldRole: 'BDM', reportingManagerId: otherAsm._id } });
  const created = await otherAsmAgent.post('/api/doctors').send({ name: 'Dr. Foreign', assignedTo: String(foreignBdm._id) });

  const { agent: asmAgent } = await authAgent(app, { email: 'asm6@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
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
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm7@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const ownBdm = await createUser({
    companyId: company._id, email: 'import-own-bdm@xyz.com',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id, employeeId: 'MMS-OWN' }
  });
  const foreignBdm = await createUser({
    companyId: company._id, email: 'import-foreign-bdm@xyz.com',
    employeeDetails: { fieldRole: 'BDM', employeeId: 'MMS-FOREIGN' }
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
  const { agent: asmAgent } = await authAgent(app, { email: 'asm-preview@xyz.com', employeeDetails: { fieldRole: 'ASM' } });

  const buffer = await buildRoster([
    ['', 'Cardiologist', 'Pune', '9999999999', ''], // missing name -> error
    ['Dr. PreviewNew', 'Neurologist', 'Mumbai', '8888888888', ''] // ok, unassigned
  ]);

  const res = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.error, 1);
  assert.equal(res.body.summary.new, 1);
  assert.equal(res.body.rows.find((r) => r.name === 'Dr. PreviewNew').status, 'ok');

  const dbCount = await (await import('../models/Doctor.js')).default.countDocuments({});
  assert.equal(dbCount, 0, 'preview must not create any doctors');
});

test('preview flags a BDM identifier outside the caller\'s reporting hierarchy', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent } = await authAgent(app, { email: 'asm-preview3@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const foreignBdm = await createUser({ companyId: company._id, email: 'foreign-preview-bdm@xyz.com', employeeDetails: { fieldRole: 'BDM', employeeId: 'PREV-FOREIGN' } });

  const buffer = await buildRoster([['Dr. Blocked', 'Cardiologist', 'Pune', '', 'PREV-FOREIGN']]);
  const res = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 200);
  assert.equal(res.body.rows[0].status, 'error');
  assert.match(res.body.rows[0].message, /reporting hierarchy/);
});

test('preview flags an existing doctor as "update", not a duplicate create', async () => {
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-preview4@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Existing' });

  const buffer = await buildRoster([['Dr. Existing', 'Cardiologist', 'Pune', '', '']]);
  const res = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 200);
  assert.equal(res.body.rows[0].status, 'update');
  assert.match(res.body.rows[0].message, /already exists/);
});

test('confirm creates ok rows, updates warning rows, and re-validates authorization server-side (never trusting client-supplied resolvedAssignedTo)', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-confirm@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const ownBdm = await createUser({
    companyId: company._id, email: 'confirm-own-bdm@xyz.com',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id, employeeId: 'CONF-OWN' }
  });
  const foreignBdm = await createUser({ companyId: company._id, email: 'confirm-foreign-bdm@xyz.com', employeeDetails: { fieldRole: 'BDM', employeeId: 'CONF-FOREIGN' } });
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

// ---------- Official MIRUS Doctor List format (DrName/Location/Employee ID/Speciality-Prac/Mobile No/DOB/DOA) ----------

test('the official column headers (row 2, with a blank row 1) are recognized end to end, including DOB/DOA', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-official@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  await createUser({
    companyId: company._id, email: 'official-bdm@xyz.com',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id, employeeId: 'OFF-001' }
  });

  const buffer = await buildOfficialRoster([[
    1, 'Dr. Official', 'Banjara Hills', 'OFF-001', 'Some BDM', 'HQ', 'Some Manager',
    'STN1', 'HQ', 'REG123', 'Male', 'A', 'Cardiology', '4', '1980-05-10', '2010-02-14',
    'Married', '123 Street', 'Clinic', 'Hyderabad', 'Telangana', '500034', 'doc@example.com', '9876543210'
  ]]);

  const preview = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(preview.status, 200);
  assert.equal(preview.body.rows.length, 1);
  const row = preview.body.rows[0];
  assert.equal(row.name, 'Dr. Official');
  assert.equal(row.area, 'Banjara Hills');
  assert.equal(row.speciality, 'Cardiology');
  assert.equal(row.phone, '9876543210');
  assert.equal(row.assignIdentifier, 'OFF-001');
  assert.equal(row.status, 'ok');

  const confirm = await asmAgent.post('/api/doctors/import/confirm').send({ rows: [row] });
  assert.equal(confirm.status, 201);
  assert.equal(confirm.body.created.length, 1);

  const Doctor = (await import('../models/Doctor.js')).default;
  const doc = await Doctor.findOne({ name: 'Dr. Official' });
  assert.equal(doc.area, 'Banjara Hills');
  assert.equal(new Date(doc.dob).toISOString().slice(0, 10), '1980-05-10');
  assert.equal(new Date(doc.anniversaryDate).toISOString().slice(0, 10), '2010-02-14');
});

// ---------- BDM Employee ID resolution / bulk assignment / invalid BDM ----------

test('an Employee ID that does not belong to any user is reported as an invalid BDM, not silently skipped', async () => {
  const { agent: asmAgent } = await authAgent(app, { email: 'asm-invalidbdm@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const buffer = await buildRoster([['Dr. NoSuchBdm', 'Cardiologist', 'Pune', '', 'NO-SUCH-ID']]);
  const res = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(res.status, 200);
  assert.equal(res.body.rows[0].status, 'error');
  assert.match(res.body.rows[0].message, /not found/i);
});

test('bulk assignment: one upload assigns multiple doctors across multiple BDMs in the caller\'s own hierarchy', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-bulk@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const bdmA = await createUser({ companyId: company._id, email: 'bulk-bdm-a@xyz.com', employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id, employeeId: 'BULK-A' } });
  const bdmB = await createUser({ companyId: company._id, email: 'bulk-bdm-b@xyz.com', employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id, employeeId: 'BULK-B' } });

  const buffer = await buildRoster([
    ['Dr. BulkOne', 'Cardiologist', 'Pune', '', 'BULK-A'],
    ['Dr. BulkTwo', 'ENT', 'Mumbai', '', 'BULK-B'],
    ['Dr. BulkThree', 'Dermatology', 'Nagpur', '', 'BULK-A']
  ]);
  const preview = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.ok(preview.body.rows.every((r) => r.status === 'ok'));

  const confirm = await asmAgent.post('/api/doctors/import/confirm').send({ rows: preview.body.rows });
  assert.equal(confirm.body.created.length, 3);

  const Doctor = (await import('../models/Doctor.js')).default;
  assert.equal(String((await Doctor.findOne({ name: 'Dr. BulkOne' })).assignedTo), String(bdmA._id));
  assert.equal(String((await Doctor.findOne({ name: 'Dr. BulkTwo' })).assignedTo), String(bdmB._id));
  assert.equal(String((await Doctor.findOne({ name: 'Dr. BulkThree' })).assignedTo), String(bdmA._id));
});

// ---------- Duplicate/conflicting rows within one upload ----------

test('two rows for the same doctor (same name+area) in one file: the second is flagged "duplicate", and confirming both never creates two doctors', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-dup@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const bdm = await createUser({ companyId: company._id, email: 'dup-bdm@xyz.com', employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id, employeeId: 'DUP-1' } });

  const buffer = await buildRoster([
    ['Dr. Duplicate', 'Cardiologist', 'Pune', '', ''],
    ['Dr. Duplicate', 'Cardiologist', 'Pune', '', 'DUP-1'] // same identity, second row also assigns
  ]);
  const preview = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(preview.body.rows[0].status, 'ok');
  assert.equal(preview.body.rows[1].status, 'duplicate');
  assert.match(preview.body.rows[1].message, /row 2/i);
  assert.equal(preview.body.summary.duplicate, 1);

  const confirm = await asmAgent.post('/api/doctors/import/confirm').send({ rows: preview.body.rows });
  assert.equal(confirm.status, 201);
  assert.equal(confirm.body.failed.length, 0);

  const Doctor = (await import('../models/Doctor.js')).default;
  const matches = await Doctor.find({ name: 'Dr. Duplicate' });
  assert.equal(matches.length, 1, 'a duplicate row must never create a second doctor');
  assert.equal(String(matches[0].assignedTo), String(bdm._id), 'the second row\'s assignment must still apply to the same doctor');
});

// ---------- Re-upload / idempotency ----------

test('re-uploading and re-confirming the exact same file a second time is a no-op create — it only updates the same doctor again', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-idempotent@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  await createUser({ companyId: company._id, email: 'idempotent-bdm@xyz.com', employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id, employeeId: 'IDEM-1' } });

  const buffer = await buildRoster([['Dr. Idempotent', 'Cardiologist', 'Pune', '', 'IDEM-1']]);

  const firstPreview = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(firstPreview.body.rows[0].status, 'ok');
  const firstConfirm = await asmAgent.post('/api/doctors/import/confirm').send({ rows: firstPreview.body.rows });
  assert.equal(firstConfirm.body.created.length, 1);

  const secondPreview = await asmAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(secondPreview.body.rows[0].status, 'update', 're-uploading the same file must now match the existing doctor, not offer to create a second one');
  const secondConfirm = await asmAgent.post('/api/doctors/import/confirm').send({ rows: secondPreview.body.rows });
  assert.equal(secondConfirm.body.created.length, 0);
  assert.equal(secondConfirm.body.updated.length, 1);

  const Doctor = (await import('../models/Doctor.js')).default;
  const matches = await Doctor.find({ name: 'Dr. Idempotent' });
  assert.equal(matches.length, 1, 're-running the same import must never duplicate the doctor');
});

// ---------- Tenant isolation ----------

test('a doctor with the same name in another tenant is never matched — import cannot leak across companies', async () => {
  const companyA = await getDefaultCompany();
  const companyB = await createCompany({ slug: 'doctor-import-beta' });
  const { agent: adminBAgent } = await authAgent(app, { company: companyB, email: 'admin-b-import@xyz.com', role: 'admin' });
  await adminBAgent.post('/api/doctors').send({ name: 'Dr. CrossTenant' });

  const { agent: asmAAgent } = await authAgent(app, { company: companyA, email: 'asm-a-import@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const buffer = await buildRoster([['Dr. CrossTenant', 'Cardiologist', 'Pune', '', '']]);
  const preview = await asmAAgent.post('/api/doctors/import/preview').attach('roster', buffer, 'doctors.xlsx');
  assert.equal(preview.body.rows[0].status, 'ok', 'the same-named doctor in another tenant must never be treated as an existing match');

  const confirm = await asmAAgent.post('/api/doctors/import/confirm').send({ rows: preview.body.rows });
  assert.equal(confirm.body.created.length, 1);

  const Doctor = (await import('../models/Doctor.js')).default;
  const matches = await Doctor.find({ name: 'Dr. CrossTenant' });
  assert.equal(matches.length, 2, 'one doctor per tenant — never merged across companies');
  const companyIds = matches.map((d) => String(d.companyId)).sort();
  assert.deepEqual(companyIds, [String(companyA._id), String(companyB._id)].sort());
});

// ---------- Alerts ----------

test('doctor alerts surface only the caller\'s own assigned doctors with an upcoming birthday', async () => {
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: 'asm-alerts@xyz.com', employeeDetails: { fieldRole: 'ASM' } });
  const bdm = await createUser({
    companyId: company._id, email: 'bdm-alerts@xyz.com', password: 'Password1',
    employeeDetails: { fieldRole: 'BDM', reportingManagerId: asm._id }
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
