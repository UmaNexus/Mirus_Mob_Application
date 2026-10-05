import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany, getOrCreateJobRole } from './helpers/factories.js';
import { clearOutbox } from '../services/emailService.js';
import User from '../models/User.js';
import JobRole from '../models/JobRole.js';
import OfferLetter from '../models/OfferLetter.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import * as mobileRoles from '../../mobile/src/navigation/roleHelpers.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); clearOutbox(); });

let n = 0;
const email = (p) => `${p}_${++n}@xyz.com`;
const BDM = 'Business development manager';
const ASM = 'Area sales manager';

const login = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { agent, body: res.body };
};
const raw = (id) => User.collection.findOne({ _id: id });

const TEMPLATE = {
  name: 'Eng',
  earningsStructure: [
    { key: 'basic', label: 'Basic', calculationType: 'percentage_of_ctc', valueFactor: 45 },
    { key: 'special', label: 'Special', calculationType: 'balance_of_ctc', valueFactor: 0 }
  ],
  deductionsStructure: [{ key: 'pf', label: 'PF', calculationType: 'percentage_of_basic', valueFactor: 12 }]
};
const setup = async () => {
  const { agent, company } = await authAgent(app, { email: email('hr'), role: 'hr' });
  const { agent: adminAgent } = await authAgent(app, { company, email: email('adm'), role: 'admin' });
  const tpl = await SalaryStructureTemplate.create({ ...TEMPLATE, companyId: company._id });
  const bdm = await getOrCreateJobRole(company._id, BDM);
  const asm = await getOrCreateJobRole(company._id, ASM);
  return { agent, adminAgent, company, tpl, bdm, asm };
};
const offerBody = (tpl, extra = {}) => ({
  candidateEmail: email('cand') , fullName: 'Vikram Singh', department: 'Sales', joiningDate: '2026-07-15',
  templateId: String(tpl._id), annualCTC: 1200000, sendEmail: false, ...extra
});

// ---------- User edit (Admin UI / User Management) ----------

test('editing a user with a JobRole id saves designation AND jobRole together (Amit Patel, MMS45873)', async () => {
  const { adminAgent, company, bdm } = await setup();
  const amit = await createUser({
    companyId: company._id, email: 'amit.patel@mirus.com',
    employeeDetails: { employeeId: 'MMS45873', designation: 'old text', reportingManagerId: null }
  });
  const rolesBefore = await JobRole.countDocuments();
  const res = await adminAgent.put(`/api/users/${amit._id}`).send({ jobRoleId: String(bdm._id) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const doc = await raw(amit._id);
  assert.equal(doc.employeeDetails.designation, BDM);
  assert.equal(String(doc.employeeDetails.jobRole), String(bdm._id));
  assert.equal(doc.employeeDetails.reportingManagerId ?? null, null, 'reporting manager stays independent');
  assert.equal(await JobRole.countDocuments(), rolesBefore, 'no JobRole was created');

  // The same user now resolves as BDM through employeeDetails.jobRole -> JobRole.name.
  const { agent, body } = await login(company, amit);
  assert.equal(body.fieldAccess.roleCode, 'BDM');
  assert.equal(mobileRoles.isLeafUser({ ...body.user, fieldAccess: body.fieldAccess }), true);
  assert.equal((await agent.get('/api/dcr')).status, 200);
});

test('a client-sent designation never overrides the chosen JobRole', async () => {
  const { adminAgent, company, bdm } = await setup();
  const u = await createUser({ companyId: company._id, email: email('u') });
  const res = await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: String(bdm._id), designation: 'Chief Wizard' });
  assert.equal(res.status, 200);
  assert.equal((await raw(u._id)).employeeDetails.designation, BDM);
});

test('changing the role BDM -> ASM replaces BOTH designation and jobRole (no stale reference)', async () => {
  const { adminAgent, company, bdm, asm } = await setup();
  const u = await createUser({ companyId: company._id, email: email('u') });
  await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: String(bdm._id) });
  const res = await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: String(asm._id) });
  assert.equal(res.status, 200);
  const doc = await raw(u._id);
  assert.equal(doc.employeeDetails.designation, ASM);
  assert.equal(String(doc.employeeDetails.jobRole), String(asm._id));
  assert.equal(res.body.user.employeeDetails.jobRole.name, ASM);
  const { body } = await login(company, u);
  assert.equal(body.fieldAccess.roleCode, 'ASM');
});

test('editing only the designation to an existing role name links that role; an unknown name is a clear 400', async () => {
  const { adminAgent, company, asm } = await setup();
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { designation: 'something' } });
  const ok = await adminAgent.put(`/api/users/${u._id}`).send({ designation: '  area SALES manager ' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  let doc = await raw(u._id);
  assert.equal(doc.employeeDetails.designation, ASM);
  assert.equal(String(doc.employeeDetails.jobRole), String(asm._id));

  const bad = await adminAgent.put(`/api/users/${u._id}`).send({ designation: 'Galactic Overlord' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /existing active job role/i);
  doc = await raw(u._id);
  assert.equal(doc.employeeDetails.designation, ASM, 'nothing was saved on the failed edit');
  assert.equal(String(doc.employeeDetails.jobRole), String(asm._id));
});

test('an unchanged designation in an edit form is left alone (no role lookup, no error)', async () => {
  const { adminAgent, company } = await setup();
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { designation: 'Legacy free text' } });
  const res = await adminAgent.put(`/api/users/${u._id}`).send({ designation: 'Legacy free text', firstName: 'Zed' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await raw(u._id)).employeeDetails.designation, 'Legacy free text');
});

test('another company\'s JobRole, an inactive JobRole and a missing id are rejected with clear errors', async () => {
  const { adminAgent, company } = await setup();
  const other = await createCompany();
  const foreign = await getOrCreateJobRole(other._id, BDM + ' ');
  const inactive = await getOrCreateJobRole(company._id, 'Retired role', { active: false });
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { designation: 'keep' } });
  for (const id of [String(foreign._id), String(inactive._id), String(new mongoose.Types.ObjectId())]) {
    const res = await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: id });
    assert.equal(res.status, 400, id);
    assert.match(res.body.message, /job role/i);
  }
  const doc = await raw(u._id);
  assert.equal(doc.employeeDetails.designation, 'keep');
  assert.equal(doc.employeeDetails.jobRole ?? null, null);
});

test('clearing the role removes the reference; the Org Hierarchy assignment dialog path (jobRoleId) syncs designation too', async () => {
  const { adminAgent, company, bdm } = await setup();
  const u = await createUser({ companyId: company._id, email: email('u') });
  await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: String(bdm._id), isActive: true });
  assert.equal((await raw(u._id)).employeeDetails.designation, BDM);
  const res = await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: null });
  assert.equal(res.status, 200);
  assert.equal((await raw(u._id)).employeeDetails.jobRole ?? null, null);
});

// ---------- Offer letter -> approval -> employee ----------

test('offer letter with a JobRole id: position = JobRole.name, jobRoleId stored, no JobRole created', async () => {
  const { agent, tpl, bdm } = await setup();
  const rolesBefore = await JobRole.countDocuments();
  const res = await agent.post('/api/offers').send(offerBody(tpl, { jobRoleId: String(bdm._id), position: 'ignored client text' }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.offer.position, BDM);
  assert.equal(String(res.body.offer.jobRoleId), String(bdm._id));
  assert.equal(await JobRole.countDocuments(), rolesBefore);
});

test('offer letter without a valid JobRole is rejected, and nothing is created', async () => {
  const { agent, tpl, company } = await setup();
  const other = await createCompany();
  const foreign = await getOrCreateJobRole(other._id, 'Foreign role');
  const before = await OfferLetter.countDocuments();
  for (const extra of [{ position: 'No Such Role' }, { jobRoleId: String(foreign._id) }, { jobRoleId: String(new mongoose.Types.ObjectId()) }]) {
    const res = await agent.post('/api/offers').send(offerBody(tpl, extra));
    assert.equal(res.status, 400, JSON.stringify(extra));
  }
  const none = await agent.post('/api/offers').send(offerBody(tpl));
  assert.equal(none.status, 400, 'a role is required');
  assert.equal(await OfferLetter.countDocuments(), before);
  assert.equal(await User.countDocuments({ companyId: company._id, role: 'employee' }), 0, 'no candidate user was staged');
});

test('offer approval creates the employee with designation AND jobRole from the offer', async () => {
  const { agent, tpl, company, bdm } = await setup();
  const created = await agent.post('/api/offers').send(offerBody(tpl, { jobRoleId: String(bdm._id), candidateEmail: 'new.hire@example.com' }));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const offerId = created.body.offer._id;
  await OfferLetter.updateOne({ _id: offerId }, { $set: { status: 'signed' } });
  const rolesBefore = await JobRole.countDocuments();
  const approve = await agent.post(`/api/offers/${offerId}/approve`).send({});
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  const emp = await User.collection.findOne({ companyId: company._id, email: 'new.hire@example.com' });
  assert.equal(emp.employeeDetails.designation, BDM);
  assert.equal(String(emp.employeeDetails.jobRole), String(bdm._id));
  assert.equal(await JobRole.countDocuments(), rolesBefore, 'approval never creates a JobRole');
  assert.ok(emp.employeeDetails.employeeId);
});

test('approval fails with a clear error when the offer\'s role no longer exists — designation alone is never saved', async () => {
  const { agent, tpl, company, bdm } = await setup();
  const created = await agent.post('/api/offers').send(offerBody(tpl, { jobRoleId: String(bdm._id), candidateEmail: 'late.hire@example.com' }));
  const offerId = created.body.offer._id;
  await OfferLetter.updateOne({ _id: offerId }, { $set: { status: 'signed' } });
  await JobRole.deleteOne({ _id: bdm._id });
  const approve = await agent.post(`/api/offers/${offerId}/approve`).send({});
  assert.equal(approve.status, 400);
  assert.match(approve.body.message, /job role/i);
  assert.equal((await OfferLetter.findById(offerId)).status, 'signed', 'the offer was not half-approved');
  const emp = await User.collection.findOne({ companyId: company._id, email: 'late.hire@example.com' });
  assert.ok(!emp?.employeeDetails?.designation, 'no half-assigned designation was written');
});

test('bulk offers resolve the position text to an existing JobRole per row; unknown roles fail that row only', async () => {
  const { agent, tpl, company, bdm } = await setup();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('roster');
  ws.addRow(['fullName', 'email', 'position', 'department', 'annualCTC', 'joiningDate', 'templateName']);
  ws.addRow(['Asha Rao', 'asha@example.com', 'business DEVELOPMENT manager', 'Sales', 800000, '2026-07-01', tpl.name]);
  ws.addRow(['Bad Row', 'bad@example.com', 'Wizard', 'Sales', 700000, '2026-07-01', tpl.name]);
  const buffer = await wb.xlsx.writeBuffer();
  const res = await agent.post('/api/offers/bulk').attach('roster', Buffer.from(buffer), { filename: 'r.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(res.status, 201);
  assert.equal(res.body.created.length, 1);
  assert.equal(res.body.failed.length, 1);
  assert.match(res.body.failed[0].error, /job role/i);
  const offer = await OfferLetter.findOne({ candidateEmail: 'asha@example.com' });
  assert.equal(offer.position, BDM);
  assert.equal(String(offer.jobRoleId), String(bdm._id));
  assert.equal(await JobRole.countDocuments({ companyId: company._id }), 2);
});

test('admin-triggered credentials for an offer also write jobRole with the designation', async () => {
  const { agent, adminAgent, tpl, company, bdm } = await setup();
  const created = await agent.post('/api/offers').send(offerBody(tpl, { jobRoleId: String(bdm._id), candidateEmail: 'cred.hire@example.com' }));
  assert.equal(created.status, 201);
  const cand = await User.findOne({ companyId: company._id, email: 'cred.hire@example.com' });
  const res = await adminAgent.post(`/api/users/${cand._id}/credentials`).send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const emp = await raw(cand._id);
  assert.equal(emp.employeeDetails.designation, BDM);
  assert.equal(String(emp.employeeDetails.jobRole), String(bdm._id));
});

test('tenant isolation: a user is assigned only the roles of their own company', async () => {
  const { adminAgent, company } = await setup();
  const b = await createCompany();
  const bRole = await getOrCreateJobRole(b._id, BDM);
  const uB = await createUser({ companyId: b._id, email: email('ub') });
  // Admin of company A cannot touch company B's user (not found) nor use B's role on A's user.
  assert.equal((await adminAgent.put(`/api/users/${uB._id}`).send({ jobRoleId: String(bRole._id) })).status, 404);
  const uA = await createUser({ companyId: company._id, email: email('ua') });
  assert.equal((await adminAgent.put(`/api/users/${uA._id}`).send({ jobRoleId: String(bRole._id) })).status, 400);
  assert.equal((await getDefaultCompany())._id.equals(company._id), true);
});

test('a JobRole stored with a non-ObjectId _id is never assigned and the API answer stays generic (no import-specific text)', async () => {
  const { adminAgent, company } = await setup();
  const hex = new mongoose.Types.ObjectId().toHexString();
  await JobRole.collection.insertOne({ _id: hex, companyId: company._id, name: 'Imported role', active: true });
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { designation: 'keep' } });
  const res = await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: hex });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Job role not found or inactive — select an existing active job role');
  assert.doesNotMatch(JSON.stringify(res.body), /ObjectId|import|string/i);
  const doc = await raw(u._id);
  assert.equal(doc.employeeDetails.jobRole ?? null, null);
  assert.equal(doc.employeeDetails.designation, 'keep');
});
