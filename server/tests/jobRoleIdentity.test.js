import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import {
  authAgent, createUser, createCompany, getDefaultCompany, getOrCreateJobRole
} from './helpers/factories.js';
import User from '../models/User.js';
import JobRole from '../models/JobRole.js';
import { roleOf } from '../services/fieldIdentity.js';
import { FIELD_ROLES } from '../config/fieldRoles.js';
import * as mobileRoles from '../../mobile/src/navigation/roleHelpers.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

let n = 0;
const email = (p) => `${p}_${++n}@xyz.com`;
const login = async (company, user) => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password: 'Password1' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { agent, body: res.body };
};
const userWithRole = async (company, roleName, extra = {}) => {
  const role = await getOrCreateJobRole(company._id, roleName);
  return createUser({ companyId: company._id, email: email('u'), ...extra, employeeDetails: { jobRole: role._id, ...(extra.employeeDetails || {}) } });
};

// ---------- every production role resolves from JobRole.name ----------

const CASES = [
  ['Business development manager', { field: true, manager: false, exec: false, code: 'BDM' }],
  ['Area sales manager', { field: true, manager: true, exec: false, code: 'ASM' }],
  ['Regional business manager', { field: true, manager: true, exec: false, code: 'RSM' }],
  ['Zonal sales manager', { field: true, manager: true, exec: false, code: 'ZSM' }],
  // Office admin is a JobRole only: not a field-force role, not an NSM, never executive.
  ['Office admin', { field: false, manager: false, exec: false, code: null }],
  ['HR', { field: false, manager: false, exec: false, code: null }],
  ['Accountant', { field: false, manager: false, exec: false, code: null }],
  ['Office assistant', { field: false, manager: false, exec: false, code: null }]
];

for (const [roleName, want] of CASES) {
  test(`JobRole "${roleName}" resolves server-side (fieldAccess + route gates)`, async () => {
    const company = await getDefaultCompany();
    const user = await userWithRole(company, roleName);
    const { agent, body } = await login(company, user);
    assert.equal(body.fieldAccess.isFieldUser, want.field);
    assert.equal(body.fieldAccess.isManager, want.manager);
    assert.equal(body.fieldAccess.isExecutive, want.exec);
    assert.equal(body.fieldAccess.roleName, roleName);
    assert.equal(body.fieldAccess.roleCode, want.code);
    assert.equal((await agent.get('/api/auth/me')).status, 200);
    assert.equal((await agent.get('/api/dcr')).status, want.field ? 200 : 403, 'leaf-level gate');
    assert.equal((await agent.get('/api/dcr/team')).status, want.manager ? 200 : 403, 'manager-level gate');
  });
}

test('field roles are keyed by the exact JobRole names — never by abbreviations', () => {
  assert.deepEqual(FIELD_ROLES.map((r) => r.name), [
    'Business development manager', 'Area sales manager', 'Regional business manager', 'Zonal sales manager'
  ]);
  assert.deepEqual(FIELD_ROLES.map((r) => r.code), ['BDM', 'ASM', 'RSM', 'ZSM']);
});

test('Area sales manager JobRole is authorized as ASM regardless of designation or any old tier value', async () => {
  const company = await getDefaultCompany();
  const role = await getOrCreateJobRole(company._id, 'Area sales manager');
  const user = await createUser({
    companyId: company._id, email: email('asm'),
    employeeDetails: { jobRole: role._id, designation: 'Business Development Manager' }
  });
  // A stale legacy tier written straight into the DB (the schema no longer has the field).
  await User.collection.updateOne({ _id: user._id }, { $set: { 'employeeDetails.fieldForce': { tier: 'BDM', territory: 'X' } } });
  const { agent, body } = await login(company, user);
  assert.equal(body.fieldAccess.roleCode, 'ASM');
  assert.equal(body.fieldAccess.isManager, true);
  assert.equal((await agent.get('/api/dcr/team')).status, 200);
});

// ---------- no tier fallback / no fieldForce ----------

test('User schema has no fieldForce attribute; a stored legacy tier grants nothing (no tier fallback)', async () => {
  assert.equal(User.schema.path('employeeDetails.fieldForce'), undefined);
  assert.equal(User.schema.path('employeeDetails.fieldForce.tier'), undefined);
  const company = await getDefaultCompany();
  const user = await createUser({ companyId: company._id, email: email('legacy') });
  await User.collection.updateOne({ _id: user._id }, { $set: { 'employeeDetails.fieldForce': { tier: 'NSM', territory: 'India' } } });
  const { agent, body } = await login(company, user);
  assert.equal(body.fieldAccess.isFieldUser, false);
  assert.equal((await agent.get('/api/dcr')).status, 403);
  assert.equal((await agent.get('/api/dcr/team')).status, 403);
  assert.equal((await agent.get('/api/auth/me')).status, 200);
});

test('designation is never an authorization source', async () => {
  const company = await getDefaultCompany();
  const user = await createUser({ companyId: company._id, email: email('desig'), employeeDetails: { designation: 'Area sales manager' } });
  const { agent, body } = await login(company, user);
  assert.equal(body.fieldAccess.isFieldUser, false);
  assert.equal((await agent.get('/api/dcr/team')).status, 403);
});

// ---------- users without a valid JobRole never crash ----------

test('user without a JobRole: HRMS works, field-force endpoints answer 403, nothing crashes', async () => {
  const company = await getDefaultCompany();
  const user = await createUser({ companyId: company._id, email: email('none') });
  const { agent, body } = await login(company, user);
  assert.equal(body.fieldAccess.isFieldUser, false);
  assert.equal(body.fieldAccess.roleName, null);
  assert.equal(body.fieldAccess.reason, 'NO_JOB_ROLE');
  for (const url of ['/api/dcr', '/api/dcr/team', '/api/field-force/team', '/api/field-force/org-summary']) {
    assert.equal((await agent.get(url)).status, 403, url);
  }
  assert.equal((await agent.get('/api/auth/me')).status, 200);
});

test('inactive / deleted / unknown / wrong-company JobRole is treated as no role (never an error)', async () => {
  const company = await getDefaultCompany();
  const other = await createCompany();
  const inactive = await getOrCreateJobRole(company._id, 'Area sales manager', { active: false });
  const gone = await getOrCreateJobRole(company._id, 'Zonal sales manager');
  const foreign = await getOrCreateJobRole(other._id, 'Office admin');
  const shapes = {
    inactive: inactive._id, deleted: gone._id, unknown: new mongoose.Types.ObjectId(), wrongCompany: foreign._id
  };
  const users = {};
  for (const [k, id] of Object.entries(shapes)) {
    users[k] = await createUser({ companyId: company._id, email: email(k), employeeDetails: { jobRole: id } });
  }
  await JobRole.deleteOne({ _id: gone._id });
  for (const [k, u] of Object.entries(users)) {
    const { agent, body } = await login(company, u);
    assert.equal(body.fieldAccess.isFieldUser, false, k);
    assert.equal(body.fieldAccess.jobRole, null, k);
    assert.equal(body.fieldAccess.reason, k === 'inactive' || k === 'wrongCompany' || k === 'deleted' || k === 'unknown' ? 'JOB_ROLE_UNRESOLVED' : 'NO_JOB_ROLE', k);
    assert.equal((await agent.get('/api/dcr/team')).status, 403, k);
    assert.equal((await agent.get('/api/auth/me')).status, 200, k);
  }
});

test('roleOf tolerates every record shape', () => {
  for (const u of [null, undefined, {}, { employeeDetails: {} }, { employeeDetails: { jobRole: 'abc' } }, { employeeDetails: { jobRole: null } }, { employeeDetails: { jobRole: { name: '' } } }]) {
    assert.doesNotThrow(() => roleOf(u));
    assert.equal(roleOf(u).isFieldRole, false);
  }
  assert.equal(roleOf({ employeeDetails: { jobRole: { name: '  AREA SALES MANAGER ', active: true } } }).code, 'ASM');
  assert.equal(roleOf({ employeeDetails: { jobRole: { name: 'Area sales manager', active: false } } }).isFieldRole, false);
});

// ---------- admin authorization (HRMS role) ----------

test('HRMS admin passes field-force gates without any JobRole; the JobRole never changes User.role', async () => {
  const company = await getDefaultCompany();
  const { agent, user } = await authAgent(app, { company, email: email('adm'), role: 'admin' });
  assert.equal((await agent.get('/api/dcr/team')).status, 200);
  assert.equal((await agent.get('/api/field-force/team')).status, 200);
  const hr = await userWithRole(company, 'HR', { role: 'employee' });
  assert.equal((await User.findById(hr._id)).role, 'employee');
  assert.equal(user.role, 'admin');
});

// ---------- reportingManagerId hierarchy + tenant isolation ----------

test('manager authorization follows reportingManagerId (own subtree only), not role names', async () => {
  const company = await getDefaultCompany();
  const { user: admin } = await authAgent(app, { company, email: email('adm'), role: 'admin' });
  const asm = await userWithRole(company, 'Area sales manager', { employeeDetails: { reportingManagerId: admin._id } });
  const bdm = await userWithRole(company, 'Business development manager', { employeeDetails: { reportingManagerId: asm._id } });
  const otherAsm = await userWithRole(company, 'Area sales manager', { employeeDetails: { reportingManagerId: admin._id } });
  const otherBdm = await userWithRole(company, 'Business development manager', { employeeDetails: { reportingManagerId: otherAsm._id } });

  const { agent } = await login(company, asm);
  const team = await agent.get('/api/field-force/team');
  assert.equal(team.status, 200);
  const ids = team.body.data.map((u) => String(u._id));
  assert.ok(ids.includes(String(bdm._id)));
  assert.ok(!ids.includes(String(otherBdm._id)), 'a sibling team is never visible');
  assert.ok(team.body.data.find((u) => String(u._id) === String(bdm._id)).isLeaf);
  assert.equal(team.body.data.find((u) => String(u._id) === String(bdm._id)).roleName, 'Business development manager');
});

test('tenant isolation: roles, users and team data never cross companies', async () => {
  const a = await getDefaultCompany();
  const b = await createCompany();
  const { user: adminA } = await authAgent(app, { company: a, email: email('admA'), role: 'admin' });
  const asmA = await userWithRole(a, 'Area sales manager', { employeeDetails: { reportingManagerId: adminA._id } });
  const bdmA = await userWithRole(a, 'Business development manager', { employeeDetails: { reportingManagerId: asmA._id } });
  const asmB = await userWithRole(b, 'Area sales manager');
  const bdmB = await userWithRole(b, 'Business development manager', { employeeDetails: { reportingManagerId: asmB._id } });

  const { agent: agentB } = await login(b, asmB);
  const team = await agentB.get('/api/field-force/team');
  const ids = team.body.data.map((u) => String(u._id));
  assert.ok(ids.includes(String(bdmB._id)));
  assert.ok(!ids.includes(String(bdmA._id)));

  // A role id from another company cannot be assigned.
  const { agent: adminAgentA } = await login(a, adminA);
  const foreignRole = await getOrCreateJobRole(b._id, 'Zonal sales manager');
  const target = await createUser({ companyId: a._id, email: email('t') });
  assert.equal((await adminAgentA.put(`/api/users/${target._id}`).send({ jobRoleId: String(foreignRole._id) })).status, 400);
});

// ---------- JobRole API is read-only ----------

test('GET /job-roles never creates JobRoles', async () => {
  const company = await getDefaultCompany();
  const { agent } = await authAgent(app, { company, email: email('adm'), role: 'admin' });
  const res = await agent.get('/api/job-roles');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
  assert.equal((await agent.get('/api/job-roles?all=true')).status, 200);
  assert.equal(await JobRole.countDocuments(), 0);
});

// ---------- mobile role resolution (server-provided identity only) ----------

test('mobile role resolution consumes only the server-provided fieldAccess', async () => {
  const company = await getDefaultCompany();
  const cases = {
    'Business development manager': { leaf: true, manager: false, exec: false },
    'Area sales manager': { leaf: false, manager: true, exec: false },
    'Zonal sales manager': { leaf: false, manager: true, exec: false },
    'Office admin': { leaf: false, manager: false, exec: false, noAccess: true },
    HR: { leaf: false, manager: false, exec: false, noAccess: true }
  };
  for (const [roleName, want] of Object.entries(cases)) {
    const user = await userWithRole(company, roleName);
    const { body } = await login(company, user);
    const mobileUser = { ...body.user, fieldAccess: body.fieldAccess };
    assert.equal(mobileRoles.isLeafUser(mobileUser), want.leaf, roleName);
    assert.equal(mobileRoles.isManagerTier(mobileUser), want.manager, roleName);
    assert.equal(mobileRoles.isExecutiveTier(mobileUser), want.exec, roleName);
    assert.equal(mobileRoles.hasFieldAccess(mobileUser), !want.noAccess, roleName);
    assert.equal(mobileRoles.roleLabel(mobileUser), roleName);
  }
  // No fieldAccess (e.g. an old server) / no role: clean "no access", never an error.
  assert.equal(mobileRoles.hasFieldAccess({ role: 'employee' }), false);
  assert.equal(mobileRoles.hasFieldAccess(null), false);
  // Admin/superadmin keep access through their HRMS role.
  assert.equal(mobileRoles.hasFieldAccess({ role: 'admin' }), true);
  assert.equal(mobileRoles.isExecutiveTier({ role: 'superadmin' }), true);
  // Designation and the old tier are never consulted.
  assert.equal(mobileRoles.isLeafUser({ role: 'employee', employeeDetails: { designation: 'Business development manager', fieldForce: { tier: 'BDM' } } }), false);
});

// ---------- Amit Patel (MMS45873): jobRole = Business development manager, no fieldForce, no manager ----------

const createAmit = async (company, extra = {}) => {
  const role = await getOrCreateJobRole(company._id, 'Business development manager');
  return createUser({
    companyId: company._id, email: 'amit.patel@mirus.com', role: 'employee',
    personalDetails: { firstName: 'Amit', lastName: 'Patel' },
    employeeDetails: {
      employeeId: 'MMS45873', designation: 'Business development manager', department: 'Sales',
      jobRole: role._id, reportingManagerId: null, ...extra
    }
  });
};

test('Amit Patel (MMS45873): JobRole "Business development manager" resolves to BDM with fieldForce absent and no reporting manager', async () => {
  const company = await getDefaultCompany();
  const amit = await createAmit(company);
  assert.equal((await User.collection.findOne({ _id: amit._id })).employeeDetails.fieldForce, undefined, 'fieldForce is absent');
  const { agent, body } = await login(company, amit);
  assert.equal(body.fieldAccess.isFieldUser, true);
  assert.equal(body.fieldAccess.roleCode, 'BDM');
  assert.equal(body.fieldAccess.roleName, 'Business development manager');
  assert.equal(body.fieldAccess.reason, null);
  const mobileUser = { ...body.user, fieldAccess: body.fieldAccess };
  assert.equal(mobileRoles.hasFieldAccess(mobileUser), true, 'mobile does not show "No field-force role assigned"');
  assert.equal(mobileRoles.isLeafUser(mobileUser), true, 'mobile opens the BDM navigator');
  assert.equal((await agent.get('/api/dcr')).status, 200);
  assert.equal((await agent.get('/api/dcr/team')).status, 403);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.fieldAccess.roleCode, 'BDM');
});

test('Amit Patel with an explicit null fieldForce, or a conflicting legacy tier, is still BDM (JobRole is the only source)', async () => {
  const company = await getDefaultCompany();
  const amit = await createAmit(company);
  for (const legacy of [{ tier: null, territory: null }, { tier: 'ASM' }, { tier: 'NSM', territory: 'India' }]) {
    await User.collection.updateOne({ _id: amit._id }, { $set: { 'employeeDetails.fieldForce': legacy } });
    const { agent, body } = await login(company, amit);
    assert.equal(body.fieldAccess.roleCode, 'BDM', JSON.stringify(legacy));
    assert.equal(body.fieldAccess.isManager, false);
    assert.equal((await agent.get('/api/dcr/team')).status, 403);
  }
});

test('Org Hierarchy keeps the real role when the reporting manager is unassigned (role and manager are independent)', async () => {
  const company = await getDefaultCompany();
  const { agent: adminAgent } = await authAgent(app, { company, email: email('adm'), role: 'admin' });
  const amit = await createAmit(company);
  const res = await adminAgent.get('/api/admin/hierarchy');
  assert.equal(res.status, 200);
  const all = [...res.body.data.unassigned, ...res.body.data.unattached];
  const node = all.find((u) => String(u._id) === String(amit._id));
  assert.ok(node, 'a user with a role but no manager is listed (needs a manager), not hidden');
  assert.equal(node.roleName, 'Business development manager');
  assert.equal(node.jobRole.name, 'Business development manager');
  assert.equal(node.employeeDetails.reportingManagerId ?? null, null);
  // A user with a manager but no role keeps their manager and shows no role.
  const none = await createUser({ companyId: company._id, email: email('norole'), employeeDetails: { employeeId: 'MMS1', reportingManagerId: amit._id } });
  const res2 = await adminAgent.get('/api/admin/hierarchy');
  const n2 = res2.body.data.unassigned.find((u) => String(u._id) === String(none._id));
  assert.ok(n2);
  assert.equal(n2.roleName, null);
  assert.equal(String(n2.employeeDetails.reportingManagerId), String(amit._id));
});

test('a user with no JobRole gets "no field-force role" (NO_JOB_ROLE) — and a role id that cannot resolve says JOB_ROLE_UNRESOLVED', async () => {
  const company = await getDefaultCompany();
  const none = await createUser({ companyId: company._id, email: email('none') });
  const { body } = await login(company, none);
  assert.equal(mobileRoles.hasFieldAccess({ ...body.user, fieldAccess: body.fieldAccess }), false);
  assert.equal(body.fieldAccess.reason, 'NO_JOB_ROLE');
});

test('Office admin JobRole gets NO field-force permissions and is not an executive; HRMS role stays separate', async () => {
  const company = await getDefaultCompany();
  const oa = await userWithRole(company, 'Office admin');
  const { agent, body } = await login(company, oa);
  assert.equal(body.fieldAccess.isFieldUser, false);
  assert.equal(body.fieldAccess.isExecutive, false);
  assert.equal(body.fieldAccess.reason, 'NOT_A_FIELD_ROLE');
  assert.equal(body.user.role, 'employee', 'User.role is independent of JobRole');
  assert.equal((await agent.get('/api/field-force/org-summary')).status, 403);
  // Only the HRMS admin role is executive.
  const { body: adminBody } = await login(company, (await authAgent(app, { company, email: email('adm'), role: 'admin' })).user);
  assert.equal(adminBody.fieldAccess.isExecutive, true);
});

// ---------- existing database records, no seed / repair step ----------

test('schema types: JobRole._id and User.employeeDetails.jobRole are ObjectIds, linked by ref', () => {
  assert.equal(JobRole.schema.path('_id').instance, 'ObjectId');
  assert.equal(User.schema.path('employeeDetails.jobRole').instance, 'ObjectId');
  assert.equal(User.schema.path('employeeDetails.jobRole').options.ref, 'JobRole');
});

test('records that already exist in the database resolve with no seeding: raw JobRole + raw user -> BDM', async () => {
  const company = await getDefaultCompany();
  // Inserted straight into the collections (as an existing database would hold them): no Mongoose
  // defaults, no timestamps, nothing created by the application.
  const roleId = new mongoose.Types.ObjectId();
  await JobRole.collection.insertOne({ _id: roleId, companyId: company._id, name: 'Business development manager', active: true });
  const proto = await createUser({ companyId: company._id, email: email('proto') });
  await User.collection.deleteOne({ _id: proto._id });
  const raw = proto.toObject();
  const id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    ...raw, _id: id, email: 'amit.patel@mirus.com',
    employeeDetails: { employeeId: 'MMS45873', designation: 'Business development manager', jobRole: roleId, fieldForce: { tier: null, territory: null } }
  });
  const user = await User.findById(id);
  const { agent, body } = await login(company, user);
  assert.equal(body.fieldAccess.roleCode, 'BDM');
  assert.equal(body.fieldAccess.reason, null);
  assert.equal((await agent.get('/api/dcr')).status, 200);
  assert.equal(await JobRole.countDocuments(), 1, 'no JobRole was created by resolving the role');
});
