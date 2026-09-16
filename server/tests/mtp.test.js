import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const loginAs = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return agent;
};

let setupCounter = 0;
/** ASM + a BDM reporting to them. */
const setupAsmBdm = async () => {
  setupCounter += 1;
  const n = setupCounter;
  const company = await getDefaultCompany();
  const { agent: asmAgent, user: asm } = await authAgent(app, { email: `asm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' } } });
  const bdm = await createUser({
    companyId: company._id, email: `bdm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const bdmAgent = await loginAs(company, bdm);
  return { company, asmAgent, asm, bdm, bdmAgent };
};

// ---------- Authentication / tier gating ----------

test('unauthenticated request is rejected', async () => {
  assert.equal((await request(app).get('/api/mtp')).status, 401);
});

test('an employee with no fieldForce tier is denied', async () => {
  const { agent } = await authAgent(app, { email: 'plain@xyz.com', role: 'employee' });
  assert.equal((await agent.get('/api/mtp')).status, 403);
  assert.equal((await agent.post('/api/mtp').send({ month: '2026-08' })).status, 403);
});

// ---------- Approver selection ----------

/**
 * Builds the full 5-tier chain BDM → ASM → RSM → ZSM → NSM, plus a company
 * admin, so approver-routing tests can prove the system actually uses
 * whichever approver the BDM explicitly selected — not just the immediate
 * manager.
 */
const setupFullChain = async () => {
  setupCounter += 1;
  const n = setupCounter;
  const company = await getDefaultCompany();
  const { agent: adminAgent, user: admin } = await authAgent(app, { company, email: `admin_${n}@xyz.com`, role: 'admin' });
  const nsm = await createUser({ companyId: company._id, email: `nsm_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM', territory: 'National' } } });
  const zsm = await createUser({
    companyId: company._id, email: `zsm_${n}@xyz.com`,
    employeeDetails: { fieldForce: { tier: 'ZSM', territory: 'South Zone' }, reportingManagerId: nsm._id }
  });
  const rsm = await createUser({
    companyId: company._id, email: `rsm_${n}@xyz.com`,
    employeeDetails: { fieldForce: { tier: 'RSM', territory: 'Telangana' }, reportingManagerId: zsm._id }
  });
  const asm = await createUser({
    companyId: company._id, email: `asm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'ASM', territory: 'Hyderabad' }, reportingManagerId: rsm._id }
  });
  const bdm = await createUser({
    companyId: company._id, email: `bdm_${n}@xyz.com`, password: 'Password1',
    employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });
  const bdmAgent = await loginAs(company, bdm);
  const asmAgent = await loginAs(company, asm);
  const rsmAgent = request.agent(app);
  await rsmAgent.post('/api/auth/login').send({ companySlug: company.slug, email: rsm.email, password: 'Password1' });
  const zsmAgent = request.agent(app);
  await zsmAgent.post('/api/auth/login').send({ companySlug: company.slug, email: zsm.email, password: 'Password1' });
  const nsmAgent = request.agent(app);
  await nsmAgent.post('/api/auth/login').send({ companySlug: company.slug, email: nsm.email, password: 'Password1' });
  return { company, bdm, bdmAgent, asm, asmAgent, rsm, rsmAgent, zsm, zsmAgent, nsm, nsmAgent, admin, adminAgent };
};

test('a BDM can retrieve their eligible approvers: real chain members at ASM+ tier', async () => {
  const { bdmAgent, asm, rsm, zsm, nsm, admin } = await setupFullChain();
  const res = await bdmAgent.get('/api/mtp/approvers');
  assert.equal(res.status, 200);
  const ids = res.body.data.map((u) => String(u._id)).sort();
  assert.deepEqual(ids, [String(asm._id), String(rsm._id), String(zsm._id), String(nsm._id), String(admin._id)].sort());
});

test('ASM, RSM, ZSM, NSM and Admin all appear when legitimately above the BDM', async () => {
  const { bdmAgent, asm, rsm, zsm, nsm, admin } = await setupFullChain();
  const res = await bdmAgent.get('/api/mtp/approvers');
  const byId = Object.fromEntries(res.body.data.map((u) => [String(u._id), u]));
  assert.equal(byId[String(asm._id)].employeeDetails.fieldForce.tier, 'ASM');
  assert.equal(byId[String(rsm._id)].employeeDetails.fieldForce.tier, 'RSM');
  assert.equal(byId[String(zsm._id)].employeeDetails.fieldForce.tier, 'ZSM');
  assert.equal(byId[String(nsm._id)].employeeDetails.fieldForce.tier, 'NSM');
  assert.ok(byId[String(admin._id)], 'admin must appear as an eligible approver');
});

test('an unrelated manager (not above this BDM) does not appear in the eligible-approver list', async () => {
  const { bdmAgent } = await setupFullChain();
  const company = await getDefaultCompany();
  const unrelatedAsm = await createUser({ companyId: company._id, email: 'unrelated-asm@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });

  const res = await bdmAgent.get('/api/mtp/approvers');
  const ids = res.body.data.map((u) => String(u._id));
  assert.ok(!ids.includes(String(unrelatedAsm._id)));
});

test('another BDM cannot be selected as an approver', async () => {
  const { bdmAgent } = await setupFullChain();
  const { bdm: otherBdm } = await setupFullChain();

  const res = await bdmAgent.get('/api/mtp/approvers');
  const ids = res.body.data.map((u) => String(u._id));
  assert.ok(!ids.includes(String(otherBdm._id)));

  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  const submitted = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(otherBdm._id) });
  assert.equal(submitted.status, 403);
});

test('a cross-tenant user cannot be selected as an approver, even with the right tier', async () => {
  const { bdmAgent } = await setupFullChain();
  const companyB = await createCompany({ slug: 'mtp-approver-cross-tenant' });
  const crossTenantAsm = await createUser({ companyId: companyB._id, email: 'cross-tenant-asm@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });

  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  const submitted = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(crossTenantAsm._id) });
  assert.equal(submitted.status, 403);
});

test('an invalid approverId is rejected', async () => {
  const { bdmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  const res = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: 'not-an-id' });
  assert.equal(res.status, 400);
});

// ---------- Create / submit ----------

test('a draft can be saved without an approver', async () => {
  const { bdmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  assert.equal(created.status, 201);
  assert.equal(created.body.mtp.status, 'draft');
  assert.equal(created.body.mtp.approverId, null);
});

test('submitting without an approverId is rejected with a clear message', async () => {
  const { bdmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  const res = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({});
  assert.equal(res.status, 400);
  assert.match(res.body.details?.[0]?.message || '', /select an approver/i);
});

test('the BDM-selected approver is stored correctly on submission', async () => {
  const { bdmAgent, rsm } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  const submitted = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(rsm._id) });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.mtp.status, 'pending');
  assert.equal(String(submitted.body.mtp.approverId._id || submitted.body.mtp.approverId), String(rsm._id));
});

// ---------- Approval: only the designated approver ----------

test('only the exact designated approver can decide a pending MTP, not another ASM', async () => {
  const { bdmAgent, asm, asmAgent } = await setupFullChain();
  const { asmAgent: unrelatedAsmAgent } = await setupAsmBdm();

  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(asm._id) });

  const blocked = await unrelatedAsmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(blocked.status, 403);

  const allowed = await asmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.mtp.status, 'approved');
});

test('the selected approver can approve; an unauthorized manager cannot', async () => {
  const { bdmAgent, rsm, rsmAgent, asmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(rsm._id) });

  const blockedAsm = await asmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(blockedAsm.status, 403, 'the immediate ASM is not the selected approver here and must not be able to decide it');

  const approved = await rsmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.mtp.status, 'approved');
});

test('the selected approver can reject, and the BDM can resubmit after revising', async () => {
  const { bdmAgent, zsm, zsmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(zsm._id) });

  const rejected = await zsmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'rejected', note: 'Revise areas' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.mtp.status, 'rejected');

  const edited = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}`).send({ remarks: 'Revised plan' });
  assert.equal(edited.body.mtp.status, 'draft');
  assert.equal(edited.body.mtp.approverId, null, 'approver must be re-selected after a rejection, not silently reused');

  const resubmitted = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(zsm._id) });
  assert.equal(resubmitted.status, 200);
  assert.equal(resubmitted.body.mtp.status, 'pending');
});

test('a rejected tour can be resubmitted via PATCH; a pending tour cannot be edited directly', async () => {
  const { bdmAgent, asm, asmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(asm._id) });
  await asmAgent.patch(`/api/mtp/${created.body.mtp._id}/decision`).send({ status: 'rejected', note: 'Too many visits' });

  // PATCH on the rejected tour resets it to draft — this IS the resubmission
  // path, not a direct field edit bypassing the lifecycle.
  const edited = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}`).send({ remarks: 'Revised plan' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.mtp.status, 'draft');

  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(asm._id) });
  const blocked = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}`).send({ remarks: 'Sneaky edit while pending' });
  assert.equal(blocked.status, 400);
});

test('a BDM cannot PATCH another BDM\'s tour', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();
  const created = await otherBdmAgent.post('/api/mtp').send({ month: '2026-08' });

  const res = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}`).send({ remarks: 'hijack' });
  assert.equal(res.status, 403);
});

// ---------- Withdraw ----------

test('a BDM can withdraw their own pending MTP; a non-pending MTP cannot be withdrawn', async () => {
  const { bdmAgent, asm } = await setupAsmBdm();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(asm._id) });

  const withdrawn = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/withdraw`);
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.mtp.status, 'withdrawn');

  const again = await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/withdraw`);
  assert.equal(again.status, 400);
});

// ---------- Pending inbox scoping ----------

test('an ASM\'s pending-approvals inbox shows only MTPs submitted to them', async () => {
  const { bdmAgent, asm, asmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent, asm: otherAsm } = await setupAsmBdm();

  const mine = await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.patch(`/api/mtp/${mine.body.mtp._id}/submit`).send({ approverId: String(asm._id) });
  const other = await otherBdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await otherBdmAgent.patch(`/api/mtp/${other.body.mtp._id}/submit`).send({ approverId: String(otherAsm._id) });

  const res = await asmAgent.get('/api/mtp/pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

// ---------- plannedVisits validation: date + Area/Location only (no doctors) ----------

test('a mobile-built date-range block (date range + one area, flattened client-side) is accepted and persisted as individual date+area rows', async () => {
  // Mirrors what the mobile MTP screen's range-block UI actually sends: a
  // date range + one selected area is flattened into one { area, date } row
  // per date *before* it ever reaches this endpoint — the server has no
  // concept of a "range", only explicit date+area rows. There is no doctor
  // selection in MTP at all.
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Range A', area: 'Banjara Hills', assignedTo: String(bdm._id) });

  const rangeDates = ['2026-08-05', '2026-08-06', '2026-08-07'];
  const plannedVisits = rangeDates.map((date) => ({ area: 'Banjara Hills', date }));

  const res = await bdmAgent.post('/api/mtp').send({ month: '2026-08', plannedVisits });
  assert.equal(res.status, 201);
  assert.equal(res.body.mtp.plannedVisits.length, 3);
  res.body.mtp.plannedVisits.forEach((v) => assert.equal(v.area, 'Banjara Hills'));
});

test('a BDM can add multiple non-overlapping ranges across different areas in one plan', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Karimnagar', area: 'Karimnagar', assignedTo: String(bdm._id) });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Warangal', area: 'Warangal', assignedTo: String(bdm._id) });

  const plannedVisits = [
    ...['2026-09-01', '2026-09-02', '2026-09-03'].map((date) => ({ area: 'Karimnagar', date })),
    ...['2026-09-08', '2026-09-09'].map((date) => ({ area: 'Warangal', date }))
  ];
  const res = await bdmAgent.post('/api/mtp').send({ month: '2026-09', plannedVisits });
  assert.equal(res.status, 201);
  assert.equal(res.body.mtp.plannedVisits.length, 5);
});

test('the same area can be reused across multiple non-overlapping ranges in one plan', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Reuse', area: 'Karimnagar', assignedTo: String(bdm._id) });

  const plannedVisits = [
    ...['2026-09-01', '2026-09-02'].map((date) => ({ area: 'Karimnagar', date })),
    ...['2026-09-15', '2026-09-16'].map((date) => ({ area: 'Karimnagar', date }))
  ];
  const res = await bdmAgent.post('/api/mtp').send({ month: '2026-09', plannedVisits });
  assert.equal(res.status, 201);
  assert.equal(res.body.mtp.plannedVisits.length, 4);
});

test('a BDM cannot plan an area they are not authorized for (no doctor assigned to them in that area)', async () => {
  const { bdmAgent } = await setupAsmBdm();

  const res = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ area: 'Unassigned Territory', date: '2026-08-05' }]
  });
  assert.equal(res.status, 403);
  assert.match(res.body.message, /not authorized/);
});

test('a planned visit date outside the plan\'s month is rejected', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. In Scope', area: 'Karimnagar', assignedTo: String(bdm._id) });

  const res = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ area: 'Karimnagar', date: '2026-09-05' }]
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /within 2026-08/);
});

test('overlapping date ranges (even across different areas) are rejected, not silently overwritten', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Karimnagar', area: 'Karimnagar', assignedTo: String(bdm._id) });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Warangal', area: 'Warangal', assignedTo: String(bdm._id) });

  const plannedVisits = [
    ...['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'].map((date) => ({ area: 'Karimnagar', date })),
    // 5–10 Sep overlaps 1–6 Sep on 5 and 6 Sep.
    ...['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'].map((date) => ({ area: 'Warangal', date }))
  ];
  const res = await bdmAgent.post('/api/mtp').send({ month: '2026-09', plannedVisits });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /overlap|already assigned/i);
});

test('a duplicate date (same area twice) is rejected the same way as an overlap', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Duplicate', area: 'Karimnagar', assignedTo: String(bdm._id) });

  const res = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [
      { area: 'Karimnagar', date: '2026-08-05' },
      { area: 'Karimnagar', date: '2026-08-05' }
    ]
  });
  assert.equal(res.status, 400);
});

test('a BDM can plan an area they are authorized for, and it persists and is readable after reload', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. Valid Visit', area: 'Hanamkonda', assignedTo: String(bdm._id) });

  const created = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ area: 'Hanamkonda', date: '2026-08-12' }]
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.mtp.plannedVisits.length, 1);
  assert.equal(created.body.mtp.plannedVisits[0].area, 'Hanamkonda');

  const listed = await bdmAgent.get('/api/mtp?month=2026-08');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data[0].plannedVisits[0].area, 'Hanamkonda');
});

test('doctor selection is no longer required — a plannedVisits entry needs no doctorId at all', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. No Selection Needed', area: 'Karimnagar', assignedTo: String(bdm._id) });

  const res = await bdmAgent.post('/api/mtp').send({
    month: '2026-08',
    plannedVisits: [{ area: 'Karimnagar', date: '2026-08-05' }]
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.mtp.plannedVisits[0].doctorId, null);
});

// ---------- Multiple independent tours in the same month ----------

test('a BDM can hold multiple independent tour plans in the same month, all listed together', async () => {
  const { bdmAgent } = await setupAsmBdm();

  const tour1 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Karimnagar tour' });
  const tour2 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Warangal tour' });
  assert.equal(tour1.status, 201);
  assert.equal(tour2.status, 201);
  assert.notEqual(tour1.body.mtp._id, tour2.body.mtp._id);

  const listed = await bdmAgent.get('/api/mtp?month=2026-11');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 2);
  const ids = listed.body.data.map((p) => p._id).sort();
  assert.deepEqual(ids, [tour1.body.mtp._id, tour2.body.mtp._id].sort());
});

test('creating a second tour after the first is approved leaves the first untouched, and both remain visible', async () => {
  const { bdmAgent, asm, asmAgent } = await setupAsmBdm();

  const tour1 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Tour 1' });
  await bdmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/submit`).send({ approverId: String(asm._id) });
  const approved = await asmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/decision`).send({ status: 'approved' });
  assert.equal(approved.body.mtp.status, 'approved');

  // Creating Tour 2 must not require touching Tour 1 at all.
  const tour2 = await bdmAgent.post('/api/mtp').send({ month: '2026-11', remarks: 'Tour 2' });
  assert.equal(tour2.status, 201);
  assert.equal(tour2.body.mtp.status, 'draft');
  await bdmAgent.patch(`/api/mtp/${tour2.body.mtp._id}/submit`).send({ approverId: String(asm._id) });

  const listed = await bdmAgent.get('/api/mtp?month=2026-11');
  assert.equal(listed.body.data.length, 2);
  const byId = Object.fromEntries(listed.body.data.map((p) => [p._id, p]));
  assert.equal(byId[tour1.body.mtp._id].status, 'approved', 'Tour 1 must still be approved');
  assert.equal(byId[tour2.body.mtp._id].status, 'pending', 'Tour 2 must be pending');
});

test('approving or rejecting one tour never affects another tour in the same month', async () => {
  const { bdmAgent, asm, asmAgent } = await setupAsmBdm();

  const tour1 = await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  const tour2 = await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  const tour3 = await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await bdmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/submit`).send({ approverId: String(asm._id) });
  await bdmAgent.patch(`/api/mtp/${tour2.body.mtp._id}/submit`).send({ approverId: String(asm._id) });
  // Tour 3 stays a draft.

  await asmAgent.patch(`/api/mtp/${tour1.body.mtp._id}/decision`).send({ status: 'approved' });
  await asmAgent.patch(`/api/mtp/${tour2.body.mtp._id}/decision`).send({ status: 'rejected', note: 'Wrong area' });

  const listed = await bdmAgent.get('/api/mtp?month=2026-11');
  const byId = Object.fromEntries(listed.body.data.map((p) => [p._id, p]));
  assert.equal(byId[tour1.body.mtp._id].status, 'approved');
  assert.equal(byId[tour2.body.mtp._id].status, 'rejected');
  assert.equal(byId[tour2.body.mtp._id].decisionNote, 'Wrong area');
  assert.equal(byId[tour3.body.mtp._id].status, 'draft');
});

test('a BDM never sees another BDM\'s tours, even across multiple tours per month', async () => {
  const { bdmAgent } = await setupAsmBdm();
  const { bdmAgent: otherBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await otherBdmAgent.post('/api/mtp').send({ month: '2026-11' });

  const mine = await bdmAgent.get('/api/mtp?month=2026-11');
  assert.equal(mine.body.data.length, 2);
});

test('an ASM sees every one of their BDM\'s multiple tours for a month via /team, but not an unrelated BDM\'s', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const { bdmAgent: unrelatedBdmAgent } = await setupAsmBdm();

  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await bdmAgent.post('/api/mtp').send({ month: '2026-11' });
  await unrelatedBdmAgent.post('/api/mtp').send({ month: '2026-11' });

  const res = await asmAgent.get('/api/mtp/team?month=2026-11');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);
  assert.ok(res.body.data.every((p) => String(p.userId._id || p.userId) === String(bdm._id)));
});

// ---------- Team MTP up the full hierarchy (RSM/ZSM/NSM/Admin), post area-only rework ----------

test('RSM, ZSM and NSM can each retrieve their appropriate subtree MTPs via /team', async () => {
  const { bdm, bdmAgent, rsmAgent, zsmAgent, nsmAgent } = await setupFullChain();
  await bdmAgent.post('/api/mtp').send({ month: '2026-09' });

  for (const managerAgent of [rsmAgent, zsmAgent, nsmAgent]) {
    // eslint-disable-next-line no-await-in-loop
    const res = await managerAgent.get('/api/mtp/team?month=2026-09');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(String(res.body.data[0].userId._id || res.body.data[0].userId), String(bdm._id));
  }
});

test('Admin can retrieve company-wide MTPs via /team, never another tenant\'s', async () => {
  const { bdm, bdmAgent, adminAgent } = await setupFullChain();
  await bdmAgent.post('/api/mtp').send({ month: '2026-09' });

  const companyB = await createCompany({ slug: 'mtp-team-admin-scope' });
  const bdmB = await createUser({ companyId: companyB._id, email: 'bdm-b-team@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const bdmBAgent = await loginAs(companyB, bdmB);
  await bdmBAgent.post('/api/mtp').send({ month: '2026-09' });

  const res = await adminAgent.get('/api/mtp/team?month=2026-09');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.some((p) => String(p.userId._id || p.userId) === String(bdm._id)));
  assert.ok(res.body.data.every((p) => String(p.userId._id || p.userId) !== String(bdmB._id)), 'Admin must never see another tenant\'s MTP');
});

test('a BDM cannot access the manager Team MTP endpoint', async () => {
  const { bdmAgent } = await setupFullChain();
  const res = await bdmAgent.get('/api/mtp/team');
  assert.equal(res.status, 403);
});

test('the selected approver can retrieve the pending MTP via their own pending-approvals inbox', async () => {
  const { bdmAgent, rsm, rsmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-09' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(rsm._id) });

  const res = await rsmAgent.get('/api/mtp/pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0]._id, created.body.mtp._id);
});

test('the MTP appears in the SELECTED approver\'s team/pending view, not the immediate manager\'s, when a higher tier was chosen', async () => {
  const { bdmAgent, asmAgent, zsm, zsmAgent } = await setupFullChain();
  const created = await bdmAgent.post('/api/mtp').send({ month: '2026-09' });
  await bdmAgent.patch(`/api/mtp/${created.body.mtp._id}/submit`).send({ approverId: String(zsm._id) });

  const zsmInbox = await zsmAgent.get('/api/mtp/pending');
  assert.equal(zsmInbox.body.data.length, 1, 'the ZSM was explicitly selected, so it must appear in their inbox');

  const asmInbox = await asmAgent.get('/api/mtp/pending');
  assert.equal(asmInbox.body.data.length, 0, 'the immediate ASM was NOT selected, so it must not appear in their inbox');
});

// ---------- Multiple ranges must never disappear from Team MTP ----------

test('all ranges of one monthly MTP are returned together in Team MTP, none dropped', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  await asmAgent.post('/api/doctors').send({ name: 'Dr. K', area: 'Karimnagar', assignedTo: String(bdm._id) });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. W', area: 'Warangal', assignedTo: String(bdm._id) });
  await asmAgent.post('/api/doctors').send({ name: 'Dr. H', area: 'Hanamkonda', assignedTo: String(bdm._id) });

  const plannedVisits = [
    ...['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'].map((date) => ({ area: 'Karimnagar', date })),
    ...['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map((date) => ({ area: 'Warangal', date })),
    ...['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map((date) => ({ area: 'Hanamkonda', date }))
  ];
  await bdmAgent.post('/api/mtp').send({ month: '2026-09', plannedVisits });

  const res = await asmAgent.get('/api/mtp/team?month=2026-09');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].plannedVisits.length, 16, 'all 16 planned days across all 3 ranges must be present');
  const areas = new Set(res.body.data[0].plannedVisits.map((v) => v.area));
  assert.deepEqual([...areas].sort(), ['Hanamkonda', 'Karimnagar', 'Warangal']);
});

test('Team MTP month filtering keeps different months\' plans independent', async () => {
  const { bdmAgent, asmAgent } = await setupAsmBdm();
  await bdmAgent.post('/api/mtp').send({ month: '2026-08' });
  await bdmAgent.post('/api/mtp').send({ month: '2026-09' });
  await bdmAgent.post('/api/mtp').send({ month: '2026-10' });

  const sepOnly = await asmAgent.get('/api/mtp/team?month=2026-09');
  assert.equal(sepOnly.body.data.length, 1);
  assert.equal(sepOnly.body.data[0].month, '2026-09');

  const octOnly = await asmAgent.get('/api/mtp/team?month=2026-10');
  assert.equal(octOnly.body.data.length, 1);
  assert.equal(octOnly.body.data[0].month, '2026-10');
});

// ---------- Existing (pre-change, doctor-based) records are preserved ----------

test('a legacy doctor-based plannedVisits record is not corrupted and remains readable', async () => {
  const { bdmAgent, asmAgent, bdm } = await setupAsmBdm();
  const doctor = await asmAgent.post('/api/doctors').send({ name: 'Dr. Legacy', area: 'Old Area', assignedTo: String(bdm._id) });

  // Simulate data written before this change: a visit with only a doctorId,
  // no area — written directly, bypassing today's create/update validation,
  // exactly as an old row already in the database would look.
  const MonthlyTourPlan = (await import('../models/MonthlyTourPlan.js')).default;
  const company = await getDefaultCompany();
  await MonthlyTourPlan.create({
    companyId: company._id, userId: bdm._id, month: '2026-07', status: 'approved',
    plannedVisits: [{ doctorId: doctor.body.doctor._id, date: new Date('2026-07-10') }]
  });

  const res = await bdmAgent.get('/api/mtp?month=2026-07');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].status, 'approved', 'old record must be untouched');
  assert.equal(res.body.data[0].plannedVisits[0].doctorId.name, 'Dr. Legacy', 'old doctor-based data is preserved, not deleted');
});

// ---------- Tenant isolation ----------

test('an admin in one company never sees MTPs from another company via /team', async () => {
  const companyA = await createCompany({ slug: 'mtp-alpha' });
  const companyB = await createCompany({ slug: 'mtp-beta' });
  const { agent: adminA } = await authAgent(app, { company: companyA, email: 'admin-a@xyz.com', role: 'admin' });
  const bdmB = await createUser({ companyId: companyB._id, email: 'bdm-b@xyz.com', password: 'Password1', employeeDetails: { fieldForce: { tier: 'BDM' } } });
  const bdmBAgent = await loginAs(companyB, bdmB);
  await bdmBAgent.post('/api/mtp').send({ month: '2026-08' });

  const res = await adminA.get('/api/mtp/team');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});
