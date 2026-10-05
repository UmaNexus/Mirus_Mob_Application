import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getOrCreateJobRole } from './helpers/factories.js';
import { clearOutbox } from '../services/emailService.js';
import { restoreSoftDeletedCandidate } from '../services/candidateService.js';
import User from '../models/User.js';
import OfferLetter from '../models/OfferLetter.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); clearOutbox(); });

let n = 0;
const email = (p) => `${p}_${++n}@xyz.com`;
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
  const bdm = await getOrCreateJobRole(company._id, 'Business development manager');
  return { agent, adminAgent, company, tpl, bdm };
};
const offerBody = (tpl, bdm, extra = {}) => ({
  candidateEmail: email('cand'), fullName: 'Vikram Singh', jobRoleId: String(bdm._id), department: 'Sales',
  joiningDate: '2026-07-15', templateId: String(tpl._id), annualCTC: 1200000, sendEmail: false, ...extra
});
const approve = async (agent, offerId) => {
  await OfferLetter.updateOne({ _id: offerId }, { $set: { status: 'signed' } });
  const res = await agent.post(`/api/offers/${offerId}/approve`).send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
};

// ---------- Offer -> approval -> employee ----------

test('offer with a Job Location: the offer keeps it (letter unchanged) and the onboarded employee gets the same workLocation', async () => {
  const { agent, tpl, bdm, company } = await setup();
  const res = await agent.post('/api/offers').send(offerBody(tpl, bdm, { location: 'Hyderabad', candidateEmail: 'hire@example.com' }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.offer.location, 'Hyderabad', 'the offer letter still carries the Job Location');
  await approve(agent, res.body.offer._id);
  const emp = await User.collection.findOne({ companyId: company._id, email: 'hire@example.com' });
  assert.equal(emp.employeeDetails.workLocation, 'Hyderabad');
  assert.equal((await OfferLetter.findById(res.body.offer._id)).location, 'Hyderabad', 'offer snapshot untouched');
});

test('offer without a Job Location: the employee gets no invented location', async () => {
  const { agent, tpl, bdm, company } = await setup();
  const res = await agent.post('/api/offers').send(offerBody(tpl, bdm, { candidateEmail: 'noloc@example.com' }));
  await approve(agent, res.body.offer._id);
  const emp = await User.collection.findOne({ companyId: company._id, email: 'noloc@example.com' });
  assert.equal(emp.employeeDetails.workLocation ?? null, null);
});

test('the offer snapshot and the employee location are independent afterwards; an admin-set location is never overwritten by provisioning', async () => {
  const { agent, adminAgent, tpl, bdm, company } = await setup();
  const res = await agent.post('/api/offers').send(offerBody(tpl, bdm, { location: 'Pune', candidateEmail: 'keep@example.com' }));
  const cand = await User.findOne({ companyId: company._id, email: 'keep@example.com' });
  // The admin already set a (different) location before credentials are issued.
  await adminAgent.put(`/api/users/${cand._id}`).send({ workLocation: 'Chennai' });
  const cred = await adminAgent.post(`/api/users/${cand._id}/credentials`).send({});
  assert.equal(cred.status, 200, JSON.stringify(cred.body));
  assert.equal((await raw(cand._id)).employeeDetails.workLocation, 'Chennai');
  // Editing the employee later does not rewrite the offer snapshot.
  await adminAgent.put(`/api/users/${cand._id}`).send({ workLocation: 'Delhi' });
  assert.equal((await OfferLetter.findById(res.body.offer._id)).location, 'Pune');
});

test('admin-triggered credentials copy the offer Job Location when the employee has none', async () => {
  const { agent, adminAgent, tpl, bdm, company } = await setup();
  await agent.post('/api/offers').send(offerBody(tpl, bdm, { location: 'Nizamabad', candidateEmail: 'cred@example.com' }));
  const cand = await User.findOne({ companyId: company._id, email: 'cred@example.com' });
  assert.equal((await adminAgent.post(`/api/users/${cand._id}/credentials`).send({})).status, 200);
  assert.equal((await raw(cand._id)).employeeDetails.workLocation, 'Nizamabad');
});

test('bulk roster: an optional Job Location column flows offer -> employee; rows without it get none', async () => {
  const { agent, tpl, company } = await setup();
  await getOrCreateJobRole(company._id, 'Area sales manager');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('roster');
  ws.addRow(['fullName', 'email', 'position', 'department', 'annualCTC', 'joiningDate', 'templateName', 'jobLocation']);
  ws.addRow(['Asha Rao', 'asha@example.com', 'Area sales manager', 'Sales', 800000, '2026-07-01', tpl.name, 'Warangal']);
  ws.addRow(['Ravi K', 'ravi@example.com', 'Area sales manager', 'Sales', 800000, '2026-07-01', tpl.name, '']);
  const buffer = await wb.xlsx.writeBuffer();
  const res = await agent.post('/api/offers/bulk').attach('roster', Buffer.from(buffer), { filename: 'r.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.created.length, 2);
  assert.equal((await OfferLetter.findOne({ candidateEmail: 'asha@example.com' })).location, 'Warangal');
  assert.equal((await OfferLetter.findOne({ candidateEmail: 'ravi@example.com' })).location, '');
});

test('restoring a soft-deleted candidate clears the previous workLocation (a new offer sets it at approval)', async () => {
  const { company } = await setup();
  const u = await createUser({ companyId: company._id, email: email('old'), employeeDetails: { workLocation: 'Old city', department: 'X' } });
  await restoreSoftDeletedCandidate(await User.findById(u._id), { fullName: 'Re Offer' });
  assert.equal((await raw(u._id)).employeeDetails.workLocation ?? null, null);
});

// ---------- User Management ----------

test('User Management: workLocation can be set, changed and cleared, and is persisted in employeeDetails', async () => {
  const { adminAgent, company } = await setup();
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { designation: 'keep', department: 'Sales' } });
  let res = await adminAgent.put(`/api/users/${u._id}`).send({ workLocation: '  Hyderabad ' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await raw(u._id)).employeeDetails.workLocation, 'Hyderabad');
  assert.equal(res.body.user.employeeDetails.workLocation, 'Hyderabad');

  res = await adminAgent.put(`/api/users/${u._id}`).send({ workLocation: 'Bengaluru' });
  assert.equal((await raw(u._id)).employeeDetails.workLocation, 'Bengaluru');

  for (const empty of ['', '   ', null]) {
    await adminAgent.put(`/api/users/${u._id}`).send({ workLocation: 'Pune' });
    res = await adminAgent.put(`/api/users/${u._id}`).send({ workLocation: empty });
    assert.equal(res.status, 200, JSON.stringify(empty));
    assert.equal('workLocation' in (await raw(u._id)).employeeDetails, false, `cleared by ${JSON.stringify(empty)}`);
  }
  assert.equal((await adminAgent.put(`/api/users/${u._id}`).send({ workLocation: 'x'.repeat(200) })).status, 400);
  // Unrelated fields were not touched.
  assert.equal((await raw(u._id)).employeeDetails.department, 'Sales');
  assert.equal((await raw(u._id)).employeeDetails.designation, 'keep');
});

test('editing only the work location leaves jobRole, designation and reportingManagerId untouched', async () => {
  const { adminAgent, company, bdm } = await setup();
  const mgr = await createUser({ companyId: company._id, email: email('asm'), employeeDetails: { fieldRole: 'ASM' } });
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { jobRole: bdm._id, designation: 'Business development manager', reportingManagerId: mgr._id } });
  const before = await raw(u._id);
  assert.equal((await adminAgent.put(`/api/users/${u._id}`).send({ workLocation: 'Hyderabad' })).status, 200);
  const after = await raw(u._id);
  assert.equal(String(after.employeeDetails.jobRole), String(before.employeeDetails.jobRole));
  assert.equal(after.employeeDetails.designation, before.employeeDetails.designation);
  assert.equal(String(after.employeeDetails.reportingManagerId), String(mgr._id));
});

// ---------- Organization Hierarchy ----------

const findNode = (data, id) => {
  const all = [...data.roots.flatMap(function w(x) { return [x, ...(x.children || []).flatMap(w)]; }), ...data.unassigned, ...data.unattached];
  return all.find((x) => String(x._id) === String(id));
};

test('Organization Hierarchy: shows the stored workLocation (not "no location"), and the dialog payload updates the same field', async () => {
  const { adminAgent, company, bdm } = await setup();
  const asm = await createUser({ companyId: company._id, email: email('asm'), employeeDetails: { fieldRole: 'ASM' } });
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { employeeId: 'MMS45873', workLocation: 'Hyderabad' } });
  let res = await adminAgent.get('/api/admin/hierarchy');
  assert.equal(findNode(res.body.data, u._id).employeeDetails.workLocation, 'Hyderabad', 'existing value now reaches the hierarchy');

  // The hierarchy edit dialog sends role + manager + (touched) workLocation through the SAME user-update API.
  const upd = await adminAgent.put(`/api/users/${u._id}`).send({ jobRoleId: String(bdm._id), reportingManagerId: String(asm._id), workLocation: 'Warangal' });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal((await raw(u._id)).employeeDetails.workLocation, 'Warangal', 'one stored field');
  res = await adminAgent.get('/api/admin/hierarchy');
  const node = findNode(res.body.data, u._id);
  assert.equal(node.employeeDetails.workLocation, 'Warangal');
  assert.equal(node.roleName, 'Business development manager');

  await adminAgent.put(`/api/users/${u._id}`).send({ workLocation: '' });
  assert.equal(findNode((await adminAgent.get('/api/admin/hierarchy')).body.data, u._id).employeeDetails.workLocation ?? null, null);
});

test('a user without a stored location simply has none (nothing is invented for existing users)', async () => {
  const { adminAgent, company } = await setup();
  const u = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { employeeId: 'E1' } });
  const node = findNode((await adminAgent.get('/api/admin/hierarchy')).body.data, u._id);
  assert.equal(node.employeeDetails?.workLocation ?? null, null);
});

// ---------- tenancy ----------

test('tenant isolation: an admin cannot read or change another company\'s work location', async () => {
  const { adminAgent, company } = await setup();
  const other = await createCompany();
  const foreign = await createUser({ companyId: other._id, email: email('f'), employeeDetails: { employeeId: 'F1', workLocation: 'Elsewhere' } });
  assert.equal((await adminAgent.put(`/api/users/${foreign._id}`).send({ workLocation: 'Hacked' })).status, 404);
  assert.equal((await raw(foreign._id)).employeeDetails.workLocation, 'Elsewhere');
  const data = (await adminAgent.get('/api/admin/hierarchy')).body.data;
  assert.equal(findNode(data, foreign._id), undefined);
  assert.ok(company);
});

// ---------- focused: provisionEmployee (the single copy point for approval AND credential issuance) ----------

test('provisionEmployee copies jobRole, designation, department and offer.location -> employeeDetails.workLocation', async () => {
  const { company, bdm } = await setup();
  const { provisionEmployee } = await import('../services/provisioningService.js');
  const cand = await createUser({ companyId: company._id, email: email('cand'), isActive: false, employeeDetails: {} });
  const offer = { jobRoleId: bdm._id, position: 'ignored when jobRoleId is set', department: 'Sales', location: 'Hyderabad', joiningDate: new Date('2026-07-15') };

  await provisionEmployee(await User.findById(cand._id), { offer });
  const ed = (await raw(cand._id)).employeeDetails;
  assert.equal(String(ed.jobRole), String(bdm._id));
  assert.equal(ed.designation, 'Business development manager');
  assert.equal(ed.department, 'Sales');
  assert.equal(ed.workLocation, 'Hyderabad');

  // A later provisioning with a different offer location never overwrites the explicitly assigned one.
  await provisionEmployee(await User.findById(cand._id), { offer: { ...offer, location: 'Pune' } });
  assert.equal((await raw(cand._id)).employeeDetails.workLocation, 'Hyderabad');
});
