import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import DailyCallReport from '../models/DailyCallReport.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const loginAs = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return agent;
};

let n = 0;
/** Full Admin -> NSM -> ZSM -> RSM -> ASM -> BDM chain, with a logged-in agent at every field-force tier. */
const buildFullChain = async () => {
  n += 1;
  const company = await getDefaultCompany();
  const { agent: adminAgent, user: admin } = await authAgent(app, { company, email: `admin_${n}@xyz.com`, role: 'admin' });
  const nsm = await createUser({ companyId: company._id, email: `nsm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM' }, reportingManagerId: admin._id } });
  const zsm = await createUser({ companyId: company._id, email: `zsm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ZSM' }, reportingManagerId: nsm._id } });
  const rsm = await createUser({ companyId: company._id, email: `rsm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'RSM' }, reportingManagerId: zsm._id } });
  const asm = await createUser({ companyId: company._id, email: `asm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id } });
  const bdm = await createUser({ companyId: company._id, email: `bdm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id } });

  const [nsmAgent, zsmAgent, rsmAgent, asmAgent, bdmAgent] = await Promise.all([
    loginAs(company, nsm), loginAs(company, zsm), loginAs(company, rsm), loginAs(company, asm), loginAs(company, bdm)
  ]);

  return { company, adminAgent, admin, nsm, nsmAgent, zsm, zsmAgent, rsm, rsmAgent, asm, asmAgent, bdm, bdmAgent };
};

// ---------- 1. Hierarchy retrieval ----------

test('Admin can retrieve the complete hierarchy', async () => {
  const { adminAgent, admin, nsm, zsm, rsm, asm, bdm } = await buildFullChain();
  const res = await adminAgent.get('/api/admin/hierarchy');
  assert.equal(res.status, 200);

  const root = res.body.data.roots.find((r) => String(r._id) === String(admin._id));
  assert.ok(root, 'admin is a root');
  const nsmNode = root.children.find((c) => String(c._id) === String(nsm._id));
  assert.ok(nsmNode, 'NSM attached under admin');
  const zsmNode = nsmNode.children.find((c) => String(c._id) === String(zsm._id));
  assert.ok(zsmNode, 'ZSM attached under NSM');
  const rsmNode = zsmNode.children.find((c) => String(c._id) === String(rsm._id));
  assert.ok(rsmNode, 'RSM attached under ZSM');
  const asmNode = rsmNode.children.find((c) => String(c._id) === String(asm._id));
  assert.ok(asmNode, 'ASM attached under RSM');
  const bdmNode = asmNode.children.find((c) => String(c._id) === String(bdm._id));
  assert.ok(bdmNode, 'BDM attached under ASM');
  assert.deepEqual(res.body.data.unattached, []);
});

// ---------- 2. Non-admin cannot modify hierarchy ----------

test('Non-admin cannot read or modify the hierarchy', async () => {
  const { company, asmAgent, bdmAgent, asm, bdm } = await buildFullChain();
  const { agent: hrAgent } = await authAgent(app, { company, email: `hr_${n}@xyz.com`, role: 'hr' });

  assert.equal((await hrAgent.get('/api/admin/hierarchy')).status, 403);
  assert.equal((await asmAgent.get('/api/admin/hierarchy')).status, 403);
  assert.equal((await bdmAgent.get('/api/admin/hierarchy')).status, 403);

  assert.equal((await hrAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: bdm._id })).status, 403);
  assert.equal((await asmAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: bdm._id })).status, 403);
});

// ---------- 3/5. Valid role + reporting-manager assignment ----------

test('Valid role (tier) assignment works', async () => {
  const { adminAgent, rsm } = await buildFullChain();
  const target = await createUser({ email: `new-asm-${Date.now()}@xyz.com`, employeeDetails: { reportingManagerId: rsm._id } });
  const res = await adminAgent.put(`/api/users/${target._id}`).send({ fieldForceTier: 'ASM' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.employeeDetails.fieldForce.tier, 'ASM');
});

test('Valid reporting-manager assignment works', async () => {
  const { adminAgent, rsm } = await buildFullChain();
  const target = await createUser({ email: `new-asm2-${Date.now()}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const res = await adminAgent.put(`/api/users/${target._id}`).send({ reportingManagerId: String(rsm._id) });
  assert.equal(res.status, 200);
  assert.equal(String(res.body.user.employeeDetails.reportingManagerId), String(rsm._id));
});

// ---------- 4. Invalid role hierarchy rejected ----------

test('Invalid reporting-hierarchy depth is rejected — a BDM cannot report directly to an RSM, skipping ASM', async () => {
  const { adminAgent, rsm } = await buildFullChain();
  const target = await createUser({ email: `bad-depth-${Date.now()}@xyz.com`, employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const res = await adminAgent.put(`/api/users/${target._id}`).send({ reportingManagerId: String(rsm._id) });
  assert.equal(res.status, 400);
});

test('An NSM must report to an Admin, not another field-force tier', async () => {
  const { adminAgent, zsm } = await buildFullChain();
  const target = await createUser({ email: `bad-nsm-${Date.now()}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM' } } });
  const res = await adminAgent.put(`/api/users/${target._id}`).send({ reportingManagerId: String(zsm._id) });
  assert.equal(res.status, 400);
});

// ---------- 6. Invalid reporting-manager assignment rejected ----------

test('A user cannot be assigned as their own reporting manager', async () => {
  const { adminAgent, asm } = await buildFullChain();
  const res = await adminAgent.put(`/api/users/${asm._id}`).send({ reportingManagerId: String(asm._id) });
  assert.equal(res.status, 400);
});

test('A non-existent reporting-manager id is rejected', async () => {
  const { adminAgent, asm } = await buildFullChain();
  const res = await adminAgent.put(`/api/users/${asm._id}`).send({ reportingManagerId: '000000000000000000000000' });
  assert.equal(res.status, 400);
});

// ---------- 7. Cross-tenant assignment rejected ----------

test('Cross-tenant reporting-manager assignment is rejected', async () => {
  const { adminAgent, asm } = await buildFullChain();
  const companyB = await createCompany({ slug: `hier-cross-tenant-${n}` });
  const foreignRsm = await createUser({ companyId: companyB._id, email: `foreign-rsm-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'RSM' } } });

  const res = await adminAgent.put(`/api/users/${asm._id}`).send({ reportingManagerId: String(foreignRsm._id) });
  assert.equal(res.status, 400);
});

// ---------- 8. Circular hierarchy rejected ----------

test('A circular reporting relationship is rejected — a manager cannot report to their own descendant', async () => {
  const { adminAgent, asm, bdm } = await buildFullChain();
  const res = await adminAgent.put(`/api/users/${asm._id}`).send({ reportingManagerId: String(bdm._id) });
  assert.equal(res.status, 400);
});

test('A deeper circular relationship (RSM -> their own grandchild BDM) is rejected', async () => {
  const { adminAgent, rsm, bdm } = await buildFullChain();
  const res = await adminAgent.put(`/api/users/${rsm._id}`).send({ reportingManagerId: String(bdm._id) });
  assert.equal(res.status, 400);
});

// ---------- 9/10/11. Manager replacement preserves descendants ----------

test('Replacing an ASM preserves all of its BDM descendants', async () => {
  const { adminAgent, rsm, asm, bdm } = await buildFullChain();
  const newAsm = await createUser({ companyId: rsm.companyId, email: `new-asm-repl-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id } });

  const res = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: newAsm._id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.reparentedCount, 1);

  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(newAsm._id));
});

test('Replacing an RSM preserves its whole ASM -> BDM subtree (BDM stays under the same ASM)', async () => {
  const { adminAgent, zsm, rsm, asm, bdm } = await buildFullChain();
  const newRsm = await createUser({ companyId: zsm.companyId, email: `new-rsm-repl-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'RSM' }, reportingManagerId: zsm._id } });

  const res = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: rsm._id, newManagerId: newRsm._id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.reparentedCount, 1);

  const reloadedAsm = await User.findById(asm._id);
  assert.equal(String(reloadedAsm.employeeDetails.reportingManagerId), String(newRsm._id), 'ASM re-parented to the new RSM');
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id), 'BDM untouched — still reports to the same ASM');
});

test('Replacing a ZSM preserves its whole RSM -> ASM -> BDM subtree', async () => {
  const { adminAgent, nsm, zsm, rsm, asm, bdm } = await buildFullChain();
  const newZsm = await createUser({ companyId: nsm.companyId, email: `new-zsm-repl-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ZSM' }, reportingManagerId: nsm._id } });

  const res = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: zsm._id, newManagerId: newZsm._id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.reparentedCount, 1);

  const reloadedRsm = await User.findById(rsm._id);
  assert.equal(String(reloadedRsm.employeeDetails.reportingManagerId), String(newZsm._id), 'RSM re-parented to the new ZSM');
  const reloadedAsm = await User.findById(asm._id);
  assert.equal(String(reloadedAsm.employeeDetails.reportingManagerId), String(rsm._id), 'ASM untouched — still reports to the same RSM');
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id), 'BDM untouched — still reports to the same ASM');
});

test('Replacement requires the same tier, rejects mismatched tier and non-manager tiers', async () => {
  const { adminAgent, rsm, asm, bdm } = await buildFullChain();

  // Wrong tier (BDM instead of ASM).
  const mismatch = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: bdm._id });
  assert.equal(mismatch.status, 400);

  // BDM has no direct reports by design — cannot be "replaced" as a manager position.
  const leafReplace = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: bdm._id, newManagerId: asm._id });
  assert.equal(leafReplace.status, 400);
});

test('Replacing a manager with one of their own descendants is rejected', async () => {
  const { adminAgent, rsm, asm, bdm } = await buildFullChain();
  // Promote the BDM to ASM tier first so the tier check alone wouldn't block this.
  await User.updateOne({ _id: bdm._id }, { $set: { 'employeeDetails.fieldForce.tier': 'ASM' } });
  const res = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: bdm._id });
  assert.equal(res.status, 400);
});

// ---------- 12. Business data ownership unaffected by replacement ----------

test('Existing doctor/DCR ownership data is unchanged after a manager replacement', async () => {
  const { adminAgent, rsm, asm, asmAgent, bdm, bdmAgent } = await buildFullChain();
  const doctorRes = await asmAgent.post('/api/doctors').send({ name: 'Dr. Hierarchy Test', assignedTo: String(bdm._id) });
  assert.equal(doctorRes.status, 201);
  const doctorId = doctorRes.body.doctor._id;
  const dcrRes = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId });
  assert.equal(dcrRes.status, 201);

  const newAsm = await createUser({ companyId: rsm.companyId, email: `new-asm-data-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id } });
  const replaceRes = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: newAsm._id });
  assert.equal(replaceRes.status, 200);

  const doctor = await Doctor.findById(doctorId);
  assert.equal(String(doctor.assignedTo), String(bdm._id), 'doctor assignment untouched');
  assert.equal(String(doctor.createdBy), String(asm._id), 'doctor creator/owner history untouched');

  const dcr = await DailyCallReport.findOne({ doctorId });
  assert.equal(String(dcr.userId), String(bdm._id), 'DCR submitter/owner untouched');
});

// ---------- 13/14. Authorization immediately follows the new hierarchy ----------

test('Manager authorization immediately follows the new hierarchy after a replacement', async () => {
  const { company, adminAgent, rsm, asm, asmAgent, bdm, bdmAgent } = await buildFullChain();
  const doctorRes = await asmAgent.post('/api/doctors').send({ name: 'Dr. Auth Test', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctorRes.body.doctor._id });

  const newAsm = await createUser({ companyId: rsm.companyId, email: `new-asm-auth-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id } });
  const newAsmAgent = await loginAs(company, newAsm);

  const replaceRes = await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: newAsm._id });
  assert.equal(replaceRes.status, 200);

  // The BDM's submissions are now visible through the NEW ASM...
  const newAsmView = await newAsmAgent.get('/api/dcr/team');
  assert.equal(newAsmView.status, 200);
  assert.equal(newAsmView.body.data.length, 1);

  // ...and no longer through the OLD ASM, who has no reports left.
  const oldAsmView = await asmAgent.get('/api/dcr/team');
  assert.equal(oldAsmView.status, 200);
  assert.equal(oldAsmView.body.data.length, 0);
});

// ---------- Newly onboarded employees (null fieldForce.tier / reportingManagerId) ----------

/** Mirrors a real post-onboarding HRMS employee: provisioned (real employeeId, active), but never opted into the field-force hierarchy. */
const createOnboardedEmployee = (overrides = {}) => createUser({
  email: `onboarded-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@xyz.com`,
  isActive: true,
  employeeDetails: { employeeId: `MMS${Math.floor(Math.random() * 100000)}`, department: 'Sales', designation: 'Regional development manager' },
  ...overrides
});

test('A newly onboarded Sales employee with null fieldForce is returned to Admin, in the unassigned bucket', async () => {
  const { adminAgent } = await buildFullChain();
  const pending = await createOnboardedEmployee();

  const res = await adminAgent.get('/api/admin/hierarchy');
  assert.equal(res.status, 200);

  const found = res.body.data.unassigned.find((u) => String(u._id) === String(pending._id));
  assert.ok(found, 'onboarded employee with null tier/manager appears in unassigned');
  assert.equal(found.employeeDetails.department, 'Sales');
  assert.equal(found.employeeDetails.designation, 'Regional development manager');
  assert.equal(found.employeeDetails.fieldForce?.tier ?? null, null);
  assert.equal(found.employeeDetails.reportingManagerId ?? null, null);

  // Never silently placed in the tree or flagged as a broken chain — they
  // simply haven't been assigned anything yet.
  assert.ok(!res.body.data.unattached.some((u) => String(u._id) === String(pending._id)));
  const inTree = res.body.data.roots.some(function walk(r) {
    return String(r._id) === String(pending._id) || (r.children || []).some(walk);
  });
  assert.equal(inTree, false);
});

test('A user with null tier can be assigned a valid field-force tier', async () => {
  const { adminAgent, asm } = await buildFullChain();
  const pending = await createOnboardedEmployee();

  const res = await adminAgent.put(`/api/users/${pending._id}`).send({ fieldForceTier: 'BDM', reportingManagerId: String(asm._id) });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.employeeDetails.fieldForce.tier, 'BDM');
});

test('A user with null reportingManagerId can be assigned a valid manager', async () => {
  const { adminAgent, rsm } = await buildFullChain();
  const pending = await createOnboardedEmployee({ employeeDetails: { employeeId: `MMS${Math.floor(Math.random() * 100000)}`, fieldForce: { tier: 'ASM' } } });

  const res = await adminAgent.put(`/api/users/${pending._id}`).send({ reportingManagerId: String(rsm._id) });
  assert.equal(res.status, 200);
  assert.equal(String(res.body.user.employeeDetails.reportingManagerId), String(rsm._id));
});

test('An invalid tier -> manager combination for a newly onboarded employee is rejected', async () => {
  const { adminAgent, rsm } = await buildFullChain();
  const pending = await createOnboardedEmployee();

  // BDM must report to an ASM, not an RSM — skipping a level.
  const res = await adminAgent.put(`/api/users/${pending._id}`).send({ fieldForceTier: 'BDM', reportingManagerId: String(rsm._id) });
  assert.equal(res.status, 400);
});

test('Cross-company manager assignment for a newly onboarded employee is rejected', async () => {
  const { adminAgent } = await buildFullChain();
  const pending = await createOnboardedEmployee();
  const companyB = await createCompany({ slug: `onboard-cross-tenant-${n}` });
  const foreignAsm = await createUser({ companyId: companyB._id, email: `foreign-asm-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' } } });

  const res = await adminAgent.put(`/api/users/${pending._id}`).send({ fieldForceTier: 'BDM', reportingManagerId: String(foreignAsm._id) });
  assert.equal(res.status, 400);
});

test('Existing already-assigned users continue to appear correctly attached, unaffected by the unassigned-bucket fix', async () => {
  const { adminAgent, admin, nsm, zsm, rsm, asm, bdm } = await buildFullChain();
  await createOnboardedEmployee(); // a pending employee alongside the real chain

  const res = await adminAgent.get('/api/admin/hierarchy');
  assert.equal(res.status, 200);
  const root = res.body.data.roots.find((r) => String(r._id) === String(admin._id));
  const nsmNode = root.children.find((c) => String(c._id) === String(nsm._id));
  const zsmNode = nsmNode.children.find((c) => String(c._id) === String(zsm._id));
  const rsmNode = zsmNode.children.find((c) => String(c._id) === String(rsm._id));
  const asmNode = rsmNode.children.find((c) => String(c._id) === String(asm._id));
  assert.ok(asmNode.children.some((c) => String(c._id) === String(bdm._id)));
  assert.deepEqual(res.body.data.unattached, []);
});

test('After assignment, the newly onboarded user appears in the correct hierarchy position, and manager visibility immediately follows', async () => {
  const { company, adminAgent, asm, asmAgent } = await buildFullChain();
  const pending = await createOnboardedEmployee();

  const assignRes = await adminAgent.put(`/api/users/${pending._id}`).send({ fieldForceTier: 'BDM', reportingManagerId: String(asm._id), fieldForceTerritory: 'Nagpur' });
  assert.equal(assignRes.status, 200);

  const hierarchyRes = await adminAgent.get('/api/admin/hierarchy');
  const findUnderAsm = (node) => {
    if (String(node._id) === String(asm._id)) return node.children.find((c) => String(c._id) === String(pending._id));
    return (node.children || []).reduce((found, child) => found || findUnderAsm(child), null);
  };
  const attached = hierarchyRes.body.data.roots.reduce((found, root) => found || findUnderAsm(root), null);
  assert.ok(attached, 'newly assigned user is now attached under their ASM in the tree');
  assert.equal(attached.employeeDetails.fieldForce.territory, 'Nagpur');

  // Manager authorization immediately follows the new hierarchy — no
  // separate "activate" step needed.
  const pendingAgent = await loginAs(company, pending);
  const doctorRes = await asmAgent.post('/api/doctors').send({ name: 'Dr. Onboard Test', assignedTo: String(pending._id) });
  assert.equal(doctorRes.status, 201);
  await pendingAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctorRes.body.doctor._id });

  const asmView = await asmAgent.get('/api/dcr/team');
  assert.equal(asmView.status, 200);
  assert.equal(asmView.body.data.length, 1);
});

// ---------- Hierarchy-integrity bug: tier change must not silently orphan existing direct reports ----------

// NOTE: promoting `asm` (ASM) to RSM also invalidates asm's OWN existing
// manager relationship (their old manager `rsm` is tier RSM, but an RSM
// itself must report to a ZSM) — a second, independent consequence of the
// SAME tier change, alongside the downstream BDM issue these tests target.
// Every test below that promotes asm to RSM therefore also supplies a valid
// new `reportingManagerId` (`zsm`, already tier ZSM in the fixture) so that
// separate, already-covered check ("Changing tier ... would invalidate this
// user's own current reporting manager") never masks the specific
// downstream-reassignment behavior being tested here.

test('ASM promoted to RSM with a BDM direct report is detected as an affected relationship, and nothing is committed', async () => {
  const { adminAgent, zsm, asm, bdm } = await buildFullChain();

  const res = await adminAgent.put(`/api/users/${asm._id}`).send({ fieldForceTier: 'RSM', reportingManagerId: String(zsm._id) });
  assert.equal(res.status, 409);
  assert.equal(res.body.details.affected.length, 1);
  assert.equal(res.body.details.affected[0].id, String(bdm._id));
  assert.equal(res.body.details.affected[0].tier, 'BDM');
  assert.equal(res.body.details.affected[0].requiredManagerTier, 'ASM');

  // Invalid BDM -> RSM relationship must never be committed — both records
  // are exactly as they were before the attempted change.
  const reloadedAsm = await User.findById(asm._id);
  assert.equal(reloadedAsm.employeeDetails.fieldForce.tier, 'ASM');
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id));
});

test('Admin can reassign the affected BDM to another valid ASM in the same request that changes the tier', async () => {
  const { adminAgent, zsm, rsm, asm, bdm } = await buildFullChain();
  const newAsm = await createUser({ companyId: rsm.companyId, email: `new-asm-cascade-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id } });

  const res = await adminAgent.put(`/api/users/${asm._id}`).send({
    fieldForceTier: 'RSM',
    reportingManagerId: String(zsm._id),
    reassignments: [{ userId: String(bdm._id), reportingManagerId: String(newAsm._id) }]
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.reassignedCount, 1);

  const reloadedAsm = await User.findById(asm._id);
  assert.equal(reloadedAsm.employeeDetails.fieldForce.tier, 'RSM');
  assert.equal(String(reloadedAsm.employeeDetails.reportingManagerId), String(zsm._id));
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(newAsm._id));
});

test('An RSM promoted to ZSM only flags their direct-report ASM as affected — the ASM\'s own BDM grandchild is untouched (only direct reports, not the whole subtree, are re-validated)', async () => {
  const { adminAgent, nsm, zsm, rsm, asm, bdm } = await buildFullChain();

  const preview = await adminAgent.put(`/api/users/${rsm._id}`).send({ fieldForceTier: 'ZSM', reportingManagerId: String(nsm._id) });
  assert.equal(preview.status, 409);
  assert.equal(preview.body.details.affected.length, 1);
  assert.equal(preview.body.details.affected[0].id, String(asm._id));

  const newRsm = await createUser({ companyId: zsm.companyId, email: `new-rsm-cascade-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'RSM' }, reportingManagerId: zsm._id } });
  const commit = await adminAgent.put(`/api/users/${rsm._id}`).send({
    fieldForceTier: 'ZSM',
    reportingManagerId: String(nsm._id),
    reassignments: [{ userId: String(asm._id), reportingManagerId: String(newRsm._id) }]
  });
  assert.equal(commit.status, 200);

  const reloadedAsm = await User.findById(asm._id);
  assert.equal(String(reloadedAsm.employeeDetails.reportingManagerId), String(newRsm._id));
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id), 'BDM grandchild untouched — still reports to the same ASM');
});

test('A reassignment pointing at an invalid manager (wrong tier) is rejected, and nothing is committed', async () => {
  const { adminAgent, zsm, rsm, asm, bdm } = await buildFullChain();
  // rsm is tier RSM, not ASM — an invalid replacement manager for the BDM.
  const res = await adminAgent.put(`/api/users/${asm._id}`).send({
    fieldForceTier: 'RSM',
    reportingManagerId: String(zsm._id),
    reassignments: [{ userId: String(bdm._id), reportingManagerId: String(rsm._id) }]
  });
  assert.equal(res.status, 400);

  const reloadedAsm = await User.findById(asm._id);
  assert.equal(reloadedAsm.employeeDetails.fieldForce.tier, 'ASM', 'tier change never committed');
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id), 'BDM reassignment never committed');
});

test('A reassignment pointing at a non-existent manager fails atomically — the tier change is never partially applied', async () => {
  const { adminAgent, zsm, asm, bdm } = await buildFullChain();
  const res = await adminAgent.put(`/api/users/${asm._id}`).send({
    fieldForceTier: 'RSM',
    reportingManagerId: String(zsm._id),
    reassignments: [{ userId: String(bdm._id), reportingManagerId: '000000000000000000000000' }]
  });
  assert.equal(res.status, 400);

  const reloadedAsm = await User.findById(asm._id);
  assert.equal(reloadedAsm.employeeDetails.fieldForce.tier, 'ASM');
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id));
});

test('A reassignment that would make an affected report their own manager (a degenerate cycle) is rejected via the same guard used elsewhere, atomically', async () => {
  const { adminAgent, zsm, asm, bdm } = await buildFullChain();
  const res = await adminAgent.put(`/api/users/${asm._id}`).send({
    fieldForceTier: 'RSM',
    reportingManagerId: String(zsm._id),
    reassignments: [{ userId: String(bdm._id), reportingManagerId: String(bdm._id) }]
  });
  assert.equal(res.status, 400);
  const reloadedAsm = await User.findById(asm._id);
  assert.equal(reloadedAsm.employeeDetails.fieldForce.tier, 'ASM', 'tier change never committed');
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id), 'reassignment never committed');
});

test('A genuinely circular reassignment (manager pointing to their own descendant) is rejected — the same wouldCreateCycle guard reused by the reassignments path', async () => {
  const { adminAgent, zsm, rsm, asm, bdm } = await buildFullChain();
  // A subordinate of bdm's own — same tier BDM requires (ASM) — whose
  // reportingManagerId chain leads back to bdm, so reassigning bdm to
  // report to it would close a cycle. bdm's own tier/manager are left
  // exactly as `buildFullChain` set them, so the ASM -> RSM promotion below
  // still flags bdm as affected exactly like the simple case.
  const subordinate = await createUser({
    companyId: rsm.companyId, email: `subordinate-${n}@xyz.com`,
    employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: bdm._id }
  });

  const res = await adminAgent.put(`/api/users/${asm._id}`).send({
    fieldForceTier: 'RSM',
    reportingManagerId: String(zsm._id),
    reassignments: [{ userId: String(bdm._id), reportingManagerId: String(subordinate._id) }]
  });
  assert.equal(res.status, 400);
  const reloadedAsm = await User.findById(asm._id);
  assert.equal(reloadedAsm.employeeDetails.fieldForce.tier, 'ASM', 'tier change never committed');
  const reloadedBdm = await User.findById(bdm._id);
  assert.equal(String(reloadedBdm.employeeDetails.reportingManagerId), String(asm._id), 'reassignment never committed');
});

test('Changing a leaf BDM\'s tier (no direct reports) never triggers the affected-list mechanism — existing valid hierarchies remain unaffected', async () => {
  const { adminAgent, rsm, bdm } = await buildFullChain();

  const res = await adminAgent.put(`/api/users/${bdm._id}`).send({ fieldForceTier: 'ASM', reportingManagerId: String(rsm._id) });
  assert.equal(res.status, 200);
  assert.equal(res.body.reassignedCount, 0);
});

test('A BDM\'s submissions remain visible to the unrelated part of the chain (RSM) but never to an outside ASM after replacement', async () => {
  const { company, adminAgent, rsm, rsmAgent, asm, asmAgent, bdm, bdmAgent } = await buildFullChain();
  const doctorRes = await asmAgent.post('/api/doctors').send({ name: 'Dr. Chain Test', assignedTo: String(bdm._id) });
  await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctorRes.body.doctor._id });

  const newAsm = await createUser({ companyId: rsm.companyId, email: `new-asm-chain-${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id } });
  await adminAgent.post('/api/admin/hierarchy/replace-manager').send({ oldManagerId: asm._id, newManagerId: newAsm._id });

  // The RSM above (unaffected by the ASM-level swap) still sees the BDM's DCR.
  const rsmView = await rsmAgent.get('/api/dcr/team');
  assert.equal(rsmView.status, 200);
  assert.equal(rsmView.body.data.length, 1);

  // A completely unrelated ASM (different subtree) never sees it.
  const { asmAgent: unrelatedAsmAgent } = await buildFullChain();
  const unrelatedView = await unrelatedAsmAgent.get('/api/dcr/team');
  assert.equal(unrelatedView.status, 200);
  assert.equal(unrelatedView.body.data.length, 0);
});
