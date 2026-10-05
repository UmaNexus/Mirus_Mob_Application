import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getOrCreateJobRole } from './helpers/factories.js';
import User from '../models/User.js';
import { isEligibleManager, requiredManagerLevel } from '../services/hierarchyGuard.js';
import { REQUIRED_MANAGER, FIELD_HIERARCHY, isNsmMapped } from '../config/fieldRoles.js';
import * as mobileRoles from '../../mobile/src/navigation/roleHelpers.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

let n = 0;
const email = (p) => `${p}_${++n}@xyz.com`;
const raw = (id) => User.collection.findOne({ _id: id });

/** One company with every level + the non-field roles, all created directly (no validation) so we can probe the API. */
const world = async () => {
  const { agent, company, user: admin } = await authAgent(app, { email: email('adm'), role: 'admin' });
  const mk = (fieldRole, extra = {}) => createUser({ companyId: company._id, email: email(fieldRole.toLowerCase()), employeeDetails: { fieldRole, ...(extra.employeeDetails || {}) }, ...extra, ...(extra.employeeDetails ? { employeeDetails: { fieldRole, ...extra.employeeDetails } } : {}) });
  const w = {
    agent, company, admin,
    zsm: await mk('ZSM'), rsm: await mk('RSM'), asm: await mk('ASM'), bdm: await mk('BDM'),
    zsm2: await mk('ZSM'), rsm2: await mk('RSM'), asm2: await mk('ASM'), bdm2: await mk('BDM'),
    hr: await mk('HR'), accountant: await mk('ACCOUNTANT'), assistant: await mk('ASSISTANT'),
    officeAdmin: await createUser({ companyId: company._id, email: email('oa'), employeeDetails: { jobRole: (await getOrCreateJobRole(company._id, 'Office admin'))._id } }),
    noRole: await createUser({ companyId: company._id, email: email('none') }),
    inactiveAsm: await createUser({ companyId: company._id, email: email('ina'), isActive: false, employeeDetails: { fieldRole: 'ASM' } })
  };
  const other = await createCompany();
  w.foreignAsm = await createUser({ companyId: other._id, email: email('fa'), employeeDetails: { fieldRole: 'ASM' } });
  return w;
};
const setManager = (w, user, manager) => w.agent.put(`/api/users/${user._id}`).send({ reportingManagerId: String(manager._id) });

// ---------- configuration ----------

test('the hierarchy is application config only: BDM < ASM < RSM < ZSM < NSM < Admin, no stored level fields', () => {
  assert.deepEqual(FIELD_HIERARCHY, ['BDM', 'ASM', 'RSM', 'ZSM', 'NSM', 'ADMIN']);
  assert.deepEqual(REQUIRED_MANAGER, { BDM: 'ASM', ASM: 'RSM', RSM: 'ZSM', ZSM: 'NSM', NSM: 'ADMIN' });
  assert.equal(User.schema.path('employeeDetails.fieldLevel'), undefined);
  assert.equal(User.schema.path('employeeDetails.reportsToRole'), undefined);
  assert.equal(isNsmMapped(), false, 'there is no NSM JobRole: the level is unmapped and nothing is invented');
});

test('pure rule: NSM -> Admin is allowed, and an NSM can never report to a field role', () => {
  const admin = { role: 'admin', employeeDetails: {} };
  const zsm = { role: 'employee', employeeDetails: { jobRole: { name: 'Zonal sales manager', active: true } } };
  assert.equal(requiredManagerLevel('NSM'), 'ADMIN');
  assert.equal(isEligibleManager('NSM', admin), true);
  assert.equal(isEligibleManager('NSM', zsm), false);
  assert.equal(isEligibleManager('ADMIN', admin), false, 'Admin has no reporting manager');
});

// ---------- server-side enforcement (PUT /api/users/:id) ----------

test('PASS: each level may report to exactly the level above', async () => {
  const w = await world();
  assert.equal((await setManager(w, w.zsm, w.admin)).status, 200, 'ZSM -> Admin (NSM level is unmapped; temporary explicit rule)');
  assert.equal((await setManager(w, w.rsm, w.zsm)).status, 200, 'RSM -> ZSM');
  assert.equal((await setManager(w, w.asm, w.rsm)).status, 200, 'ASM -> RSM');
  assert.equal((await setManager(w, w.bdm, w.asm)).status, 200, 'BDM -> ASM');
  assert.equal(String((await raw(w.bdm._id)).employeeDetails.reportingManagerId), String(w.asm._id));
});

test('FAIL: same-level and lower-level managers are rejected, with the stored manager untouched', async () => {
  const w = await world();
  const cases = [
    ['ZSM -> BDM', w.zsm, w.bdm], ['ZSM -> ZSM', w.zsm, w.zsm2], ['ZSM -> RSM', w.zsm, w.rsm], ['ZSM -> ASM', w.zsm, w.asm],
    ['RSM -> BDM', w.rsm, w.bdm], ['RSM -> RSM', w.rsm, w.rsm2], ['RSM -> ASM', w.rsm, w.asm],
    ['ASM -> BDM', w.asm, w.bdm], ['ASM -> ASM', w.asm, w.asm2], ['ASM -> ZSM (skips RSM)', w.asm, w.zsm],
    ['BDM -> RSM', w.bdm, w.rsm], ['BDM -> BDM', w.bdm, w.bdm2], ['BDM -> ZSM', w.bdm, w.zsm], ['BDM -> Admin (not an ASM)', w.bdm, w.admin],
    ['RSM -> Admin (not a ZSM)', w.rsm, w.admin]
  ];
  for (const [label, user, manager] of cases) {
    const res = await setManager(w, user, manager);
    assert.equal(res.status, 400, `${label}: ${JSON.stringify(res.body)}`);
    assert.equal((await raw(user._id)).employeeDetails.reportingManagerId ?? null, null, `${label}: nothing saved`);
  }
});

test('FAIL: HR, Accountant, Office assistant, Office admin and role-less users can never be a field-force manager', async () => {
  const w = await world();
  for (const [target, tname] of [[w.bdm, 'BDM'], [w.asm, 'ASM'], [w.rsm, 'RSM'], [w.zsm, 'ZSM']]) {
    for (const [mgr, mname] of [[w.hr, 'HR'], [w.accountant, 'Accountant'], [w.assistant, 'Office assistant'], [w.officeAdmin, 'Office admin'], [w.noRole, 'no role']]) {
      const res = await setManager(w, target, mgr);
      assert.equal(res.status, 400, `${tname} -> ${mname}`);
    }
  }
});

test('FAIL: inactive manager, other-company manager, unknown id and self are rejected', async () => {
  const w = await world();
  assert.equal((await setManager(w, w.bdm, w.inactiveAsm)).status, 400);
  assert.equal((await setManager(w, w.bdm, w.foreignAsm)).status, 400);
  assert.equal((await w.agent.put(`/api/users/${w.bdm._id}`).send({ reportingManagerId: String(new (await import('mongoose')).default.Types.ObjectId()) })).status, 400);
  assert.equal((await setManager(w, w.bdm, w.bdm)).status, 400);
});

test('an Admin (HRMS role) has no reporting manager; a circular chain is rejected', async () => {
  const w = await world();
  const res = await setManager(w, w.admin, w.zsm);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /top of the hierarchy/);
  await User.collection.updateOne({ _id: w.bdm._id }, { $set: { 'employeeDetails.reportingManagerId': w.asm._id } });
  await User.collection.updateOne({ _id: w.asm._id }, { $set: { 'employeeDetails.reportingManagerId': w.rsm._id } });
  assert.equal((await setManager(w, w.rsm, w.zsm)).status, 200);
  await User.collection.updateOne({ _id: w.zsm._id }, { $set: { 'employeeDetails.reportingManagerId': w.admin._id } });
  assert.equal((await w.agent.put(`/api/users/${w.rsm._id}`).send({ reportingManagerId: String(w.bdm._id) })).status, 400);
});

test('the role and manager chosen in the SAME request are validated together', async () => {
  const w = await world();
  const bdmRole = await getOrCreateJobRole(w.company._id, 'Business development manager');
  const plain = await createUser({ companyId: w.company._id, email: email('new') });
  const bad = await w.agent.put(`/api/users/${plain._id}`).send({ jobRoleId: String(bdmRole._id), reportingManagerId: String(w.rsm._id) });
  assert.equal(bad.status, 400);
  assert.equal((await raw(plain._id)).employeeDetails.jobRole ?? null, null, 'nothing was saved');
  const ok = await w.agent.put(`/api/users/${plain._id}`).send({ jobRoleId: String(bdmRole._id), reportingManagerId: String(w.asm._id) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('a role change never rewrites reportingManagerId; an existing invalid manager is reported, not changed', async () => {
  const w = await world();
  await User.collection.updateOne({ _id: w.bdm._id }, { $set: { 'employeeDetails.reportingManagerId': w.asm._id } });
  const zsmRole = await getOrCreateJobRole(w.company._id, 'Zonal sales manager');
  const res = await w.agent.put(`/api/users/${w.bdm._id}`).send({ jobRoleId: String(zsmRole._id) });
  assert.equal(res.status, 200);
  assert.match(res.body.hierarchyWarning, /no longer valid/);
  assert.equal(String((await raw(w.bdm._id)).employeeDetails.reportingManagerId), String(w.asm._id), 'stored relationship untouched');
});

// ---------- candidate API (what the UI shows) ----------

const candidates = async (w, user, query = '') => (await w.agent.get(`/api/users/${user._id}/eligible-managers${query}`)).body.data;
const ids = (list) => list.map((c) => String(c._id)).sort();

test('eligible-managers returns ONLY the level above — invalid candidates are excluded, not merely sorted', async () => {
  const w = await world();
  assert.deepEqual(ids(await candidates(w, w.bdm)), ids([w.asm, w.asm2]), 'BDM -> ASMs only (no inactive/foreign ASM, no BDM, RSM, HR…)');
  assert.deepEqual(ids(await candidates(w, w.asm)), ids([w.rsm, w.rsm2]), 'ASM -> RSMs only');
  assert.deepEqual(ids(await candidates(w, w.rsm)), ids([w.zsm, w.zsm2]), 'RSM -> ZSMs only');
  assert.deepEqual(ids(await candidates(w, w.zsm)), ids([w.admin]), 'ZSM -> Admin only (no BDM, no ZSM, no RSM)');
  assert.deepEqual(await candidates(w, w.admin), [], 'Admin has no field-force reporting manager');
  const zsmCandidates = await candidates(w, w.zsm);
  assert.ok(zsmCandidates.every((c) => c.isAdmin && c.roleName === 'Admin'));
});

test('eligible-managers excludes the user themself and their own descendants, and previews a role being chosen', async () => {
  const w = await world();
  await User.collection.updateOne({ _id: w.asm2._id }, { $set: { 'employeeDetails.reportingManagerId': w.rsm._id } });
  await User.collection.updateOne({ _id: w.rsm._id }, { $set: { 'employeeDetails.reportingManagerId': w.zsm._id } });
  assert.ok(!ids(await candidates(w, w.zsm)).includes(String(w.zsm._id)));
  // Previewing the ASM role for a role-less user lists RSMs; previewing BDM lists ASMs.
  const asmRole = await getOrCreateJobRole(w.company._id, 'Area sales manager');
  const bdmRole = await getOrCreateJobRole(w.company._id, 'Business development manager');
  assert.deepEqual(ids(await candidates(w, w.noRole, `?jobRoleId=${asmRole._id}`)), ids([w.rsm, w.rsm2]));
  assert.deepEqual(ids(await candidates(w, w.noRole, `?jobRoleId=${bdmRole._id}`)), ids([w.asm, w.asm2]));
});

test('eligible-managers is protected, tenant-scoped and hides HR/Accountant/Office assistant/Office admin from field roles', async () => {
  const w = await world();
  const { agent: emp } = await authAgent(app, { company: w.company, email: email('emp'), role: 'employee' });
  assert.equal((await emp.get(`/api/users/${w.bdm._id}/eligible-managers`)).status, 403);
  const other = await createCompany();
  const { agent: otherAdmin } = await authAgent(app, { company: other, email: email('oadm'), role: 'admin' });
  assert.equal((await otherAdmin.get(`/api/users/${w.bdm._id}/eligible-managers`)).status, 404);
  for (const target of [w.bdm, w.asm, w.rsm, w.zsm]) {
    const list = ids(await candidates(w, target));
    for (const bad of [w.hr, w.accountant, w.assistant, w.officeAdmin, w.noRole]) assert.ok(!list.includes(String(bad._id)));
  }
});

test('Organization Hierarchy API reports invalid stored relationships (read-only) and never modifies them', async () => {
  const w = await world();
  await User.collection.updateOne({ _id: w.zsm._id }, { $set: { 'employeeDetails.reportingManagerId': w.bdm._id } });   // ZSM -> BDM
  await User.collection.updateOne({ _id: w.asm._id }, { $set: { 'employeeDetails.reportingManagerId': w.bdm2._id } });  // ASM -> BDM
  await User.collection.updateOne({ _id: w.rsm._id }, { $set: { 'employeeDetails.reportingManagerId': w.asm2._id } });  // RSM -> ASM
  await User.collection.updateOne({ _id: w.bdm._id }, { $set: { 'employeeDetails.reportingManagerId': w.asm._id } });    // valid
  const snap = async () => JSON.stringify(await User.collection.find().sort({ _id: 1 }).toArray());
  const before = await snap();
  const res = await w.agent.get('/api/admin/hierarchy');
  assert.equal(res.status, 200);
  const bad = Object.fromEntries(res.body.data.invalidRelationships.map((r) => [r.userId, `${r.level}->${r.managerLevel}`]));
  assert.equal(bad[String(w.zsm._id)], 'ZSM->BDM');
  assert.equal(bad[String(w.asm._id)], 'ASM->BDM');
  assert.equal(bad[String(w.rsm._id)], 'RSM->ASM');
  assert.ok(!(String(w.bdm._id) in bad), 'BDM -> ASM is valid');
  assert.equal(await snap(), before, 'the audit modified nothing');
});

// ---------- mobile exclusion ----------

test('HR, Accountant, Office assistant and Office admin get no field-force mobile access; each level gets its own', async () => {
  const w = await world();
  const check = async (user) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ companySlug: w.company.slug, email: user.email, password: 'Password1' });
    assert.equal(res.status, 200);
    return { ...res.body.user, fieldAccess: res.body.fieldAccess };
  };
  for (const u of [w.hr, w.accountant, w.assistant, w.officeAdmin, w.noRole]) {
    const m = await check(u);
    assert.equal(mobileRoles.hasFieldAccess(m), false);
  }
  assert.equal(mobileRoles.isLeafUser(await check(w.bdm)), true);
  for (const u of [w.asm, w.rsm, w.zsm]) {
    const m = await check(u);
    assert.equal(mobileRoles.hasFieldAccess(m), true);
    assert.equal(mobileRoles.isManagerTier(m), true);
    assert.equal(mobileRoles.isLeafUser(m), false);
  }
  assert.equal((await check(w.zsm)).fieldAccess.roleCode, 'ZSM');
});

// ---------- the exact Organization Hierarchy dialog scenario: RSM -> ZSM ----------

test('JobRole names resolve to the canonical field roles: Regional business manager = RSM, Zonal sales manager = ZSM', async () => {
  const { roleOf } = await import('../services/fieldIdentity.js');
  const code = (name) => roleOf({ employeeDetails: { jobRole: { name, active: true } } }).code;
  assert.equal(code('Business development manager'), 'BDM');
  assert.equal(code('Area sales manager'), 'ASM');
  assert.equal(code('Regional business manager'), 'RSM');
  assert.equal(code('Zonal sales manager'), 'ZSM');
});

test('RSM -> ZSM: choosing the RSM role in the dialog lists the active ZSMs, and role + ZSM manager can be saved together', async () => {
  const w = await world();
  const rsmRole = await getOrCreateJobRole(w.company._id, 'Regional business manager');
  // "Max": a user with no role yet (as in the dialog), previewing the RSM role.
  const max = await createUser({ companyId: w.company._id, email: email('max') });
  const res = await w.agent.get(`/api/users/${max._id}/eligible-managers?jobRoleId=${rsmRole._id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res.body.data), ids([w.zsm, w.zsm2]), 'exactly the active ZSMs');
  assert.ok(res.body.data.every((c) => c.roleName === 'Zonal sales manager'));
  assert.deepEqual(res.body.inactiveEligible, []);
  // ...and assigning the RSM role together with one of those ZSMs succeeds.
  const save = await w.agent.put(`/api/users/${max._id}`).send({ jobRoleId: String(rsmRole._id), reportingManagerId: String(w.zsm._id) });
  assert.equal(save.status, 200, JSON.stringify(save.body));
  const doc = await raw(max._id);
  assert.equal(String(doc.employeeDetails.jobRole), String(rsmRole._id));
  assert.equal(String(doc.employeeDetails.reportingManagerId), String(w.zsm._id));
  // The same user is now an RSM: the stored-role candidate list is the same ZSMs.
  assert.deepEqual(ids(await candidates(w, max)), ids([w.zsm, w.zsm2]));
});

test('an INACTIVE ZSM is never offered, but the response says who would qualify; activating them makes them selectable', async () => {
  const w = await world();
  await User.collection.updateMany({ _id: { $in: [w.zsm._id, w.zsm2._id] } }, { $set: { isActive: false } });
  const rsmRole = await getOrCreateJobRole(w.company._id, 'Regional business manager');
  const max = await createUser({ companyId: w.company._id, email: email('max') });
  let res = await w.agent.get(`/api/users/${max._id}/eligible-managers?jobRoleId=${rsmRole._id}`);
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.inactiveEligible.length, 2, 'both inactive ZSMs are reported by name, not offered');
  assert.equal((await w.agent.put(`/api/users/${max._id}`).send({ jobRoleId: String(rsmRole._id), reportingManagerId: String(w.zsm._id) })).status, 400);
  await User.collection.updateOne({ _id: w.zsm._id }, { $set: { isActive: true } });
  res = await w.agent.get(`/api/users/${max._id}/eligible-managers?jobRoleId=${rsmRole._id}`);
  assert.deepEqual(ids(res.body.data), ids([w.zsm]));
  assert.equal(res.body.inactiveEligible.length, 0);
});

test('all required relationships through the candidate API and save: BDM->ASM, ASM->RSM, RSM->ZSM, ZSM->NSM(Admin stand-in), NSM->Admin(rule)', async () => {
  const w = await world();
  for (const [user, mgr] of [[w.bdm, w.asm], [w.asm, w.rsm], [w.rsm, w.zsm]]) {
    const list = ids(await candidates(w, user));
    assert.ok(list.includes(String(mgr._id)), 'candidate listed');
    assert.equal((await setManager(w, user, mgr)).status, 200);
  }
  // ZSM -> NSM: no NSM job role exists, so the NSM level is satisfied by an HRMS Admin (explicit temporary flag).
  assert.deepEqual(ids(await candidates(w, w.zsm)), ids([w.admin]));
  assert.equal((await setManager(w, w.zsm, w.admin)).status, 200);
  // NSM -> Admin is the configured rule (no NSM user can exist yet).
  assert.equal(REQUIRED_MANAGER.NSM, 'ADMIN');
  assert.equal(isEligibleManager('NSM', { role: 'admin', employeeDetails: {} }), true);
});
