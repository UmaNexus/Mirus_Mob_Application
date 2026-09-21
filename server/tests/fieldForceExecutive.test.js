import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, getDefaultCompany } from './helpers/factories.js';

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

/** Admin -> NSM -> ZSM -> RSM -> ASM -> BDM, all in one company, with a login agent for every tier. */
const buildFullChain = async (suffix = '') => {
  n += 1;
  const tag = `${n}${suffix}`;
  const company = await getDefaultCompany();
  const { agent: adminAgent, user: admin } = await authAgent(app, { company, email: `admin_${tag}@xyz.com`, role: 'admin' });
  const nsm = await createUser({ companyId: company._id, email: `nsm_${tag}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM' }, reportingManagerId: admin._id } });
  const zsm = await createUser({ companyId: company._id, email: `zsm_${tag}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ZSM' }, reportingManagerId: nsm._id } });
  const rsm = await createUser({ companyId: company._id, email: `rsm_${tag}@xyz.com`, employeeDetails: { fieldForce: { tier: 'RSM' }, reportingManagerId: zsm._id } });
  const asm = await createUser({ companyId: company._id, email: `asm_${tag}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id } });
  const bdm = await createUser({ companyId: company._id, email: `bdm_${tag}@xyz.com`, employeeDetails: { fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id } });

  const [nsmAgent, zsmAgent, rsmAgent, asmAgent, bdmAgent] = await Promise.all([
    loginAs(company, nsm), loginAs(company, zsm), loginAs(company, rsm), loginAs(company, asm), loginAs(company, bdm)
  ]);

  return { company, adminAgent, admin, nsm, nsmAgent, zsm, zsmAgent, rsm, rsmAgent, asm, asmAgent, bdm, bdmAgent };
};

// ---------- Authorization / scoping ----------

test('NSM org-summary and tier-directory are scoped to their own subtree only — never a sibling NSM\'s people', async () => {
  const { company, nsmAgent: nsm1Agent, zsm: zsm1, rsm: rsm1, asm: asm1, bdm: bdm1 } = await buildFullChain('a');

  // A second, unrelated NSM chain under the SAME admin/company.
  const { agent: admin2Agent } = await authAgent(app, { company, email: `admin2_${n}@xyz.com`, role: 'admin' });
  void admin2Agent;
  const nsm2 = await createUser({ companyId: company._id, email: `nsm2_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM' } } });
  const zsm2 = await createUser({ companyId: company._id, email: `zsm2_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ZSM' }, reportingManagerId: nsm2._id } });

  const summary = await nsm1Agent.get('/api/field-force/org-summary');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.scope, 'subtree');
  assert.equal(summary.body.data.tierCounts.ZSM, 1, 'only the caller\'s own ZSM, never the sibling NSM\'s ZSM');
  assert.equal(summary.body.data.tierCounts.RSM, 1);
  assert.equal(summary.body.data.tierCounts.ASM, 1);
  assert.equal(summary.body.data.tierCounts.BDM, 1);

  const directory = await nsm1Agent.get('/api/field-force/tier-directory');
  assert.equal(directory.status, 200);
  assert.equal(directory.body.data.length, 1);
  assert.equal(String(directory.body.data[0].userId), String(zsm1._id));
  assert.ok(!directory.body.data.some((r) => String(r.userId) === String(zsm2._id)), 'sibling NSM\'s ZSM must never appear');

  void rsm1; void asm1; void bdm1;
});

test('Admin sees company-wide data, including multiple NSMs, via org-summary and tier-directory', async () => {
  const { company, adminAgent, admin, nsm: nsm1 } = await buildFullChain('b');
  const nsm2 = await createUser({ companyId: company._id, email: `nsm2b_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM' }, reportingManagerId: admin._id } });

  const summary = await adminAgent.get('/api/field-force/org-summary');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.scope, 'company');
  assert.equal(summary.body.data.tierCounts.NSM, 2, 'company-wide tierCounts include every NSM, not just one subtree');

  const directory = await adminAgent.get('/api/field-force/tier-directory');
  assert.equal(directory.status, 200);
  const ids = directory.body.data.map((r) => String(r.userId));
  assert.ok(ids.includes(String(nsm1._id)));
  assert.ok(ids.includes(String(nsm2._id)));
});

test('A BDM gets 403 on every executive monitoring endpoint', async () => {
  const { bdmAgent } = await buildFullChain('c');
  assert.equal((await bdmAgent.get('/api/field-force/org-summary')).status, 403);
  assert.equal((await bdmAgent.get('/api/field-force/tier-directory')).status, 403);
  assert.equal((await bdmAgent.get('/api/field-force/reports-summary')).status, 403);
});

test('tier-directory rejects a managerId outside the caller\'s own authorized scope', async () => {
  const { company, nsmAgent: nsm1Agent } = await buildFullChain('d');
  const nsm2 = await createUser({ companyId: company._id, email: `nsm2d_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'NSM' } } });
  const zsm2 = await createUser({ companyId: company._id, email: `zsm2d_${n}@xyz.com`, employeeDetails: { fieldForce: { tier: 'ZSM' }, reportingManagerId: nsm2._id } });

  const res = await nsm1Agent.get('/api/field-force/tier-directory').query({ managerId: String(zsm2._id) });
  assert.equal(res.status, 403);
});

test('tier-directory drills into a real ASM and returns exactly that ASM\'s direct-report BDMs, with performance figures', async () => {
  const { nsmAgent, asm, bdm } = await buildFullChain('e');
  const res = await nsmAgent.get('/api/field-force/tier-directory').query({ managerId: String(asm._id) });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  const row = res.body.data[0];
  assert.equal(String(row.userId), String(bdm._id));
  assert.equal(row.tier, 'BDM');
  assert.ok(typeof row.dcrRate === 'number');
  assert.ok(typeof row.mtpAdherence === 'number');
});

test('tier-directory on a manager-tier row (ASM/RSM/ZSM) returns directReportCount and a subtree roll-up, not a per-BDM performance shape', async () => {
  const { nsmAgent, zsm, rsm } = await buildFullChain('f');
  const res = await nsmAgent.get('/api/field-force/tier-directory');
  assert.equal(res.status, 200);
  const row = res.body.data.find((r) => String(r.userId) === String(zsm._id));
  assert.ok(row, 'the NSM\'s own direct report (the ZSM) must be present');
  assert.equal(row.directReportCount, 1);
  assert.ok(typeof row.dcrRate === 'number');
  assert.ok(typeof row.mtpAdherence === 'number');
  void rsm;
});

// ---------- team-attendance backward compatibility + tier generalization ----------

test('team-attendance with no tier param still returns BDM-only rows, unchanged from before', async () => {
  const { asmAgent, bdm } = await buildFullChain('g');
  const res = await asmAgent.get('/api/field-force/team-attendance');
  assert.equal(res.status, 200);
  assert.equal(res.body.tier, 'BDM');
  assert.equal(res.body.rows.length, 1);
  assert.equal(String(res.body.rows[0].userId), String(bdm._id));
});

test('team-attendance?tier=ZSM returns ZSM rows across the caller\'s whole subtree', async () => {
  const { nsmAgent, zsm } = await buildFullChain('h');
  const res = await nsmAgent.get('/api/field-force/team-attendance').query({ tier: 'ZSM' });
  assert.equal(res.status, 200);
  assert.equal(res.body.tier, 'ZSM');
  assert.equal(res.body.rows.length, 1);
  assert.equal(String(res.body.rows[0].userId), String(zsm._id));
});

// ---------- reports-summary ----------

test('reports-summary reflects real submitted data for the current period, not hardcoded numbers', async () => {
  const { asmAgent, bdmAgent, bdm } = await buildFullChain('i');
  const doctorRes = await asmAgent.post('/api/doctors').send({ name: 'Dr. Reports Test', assignedTo: String(bdm._id) });
  assert.equal(doctorRes.status, 201);
  const dcrRes = await bdmAgent.post('/api/dcr').send({ type: 'individual', doctorId: doctorRes.body.doctor._id });
  assert.equal(dcrRes.status, 201);

  const res = await asmAgent.get('/api/field-force/reports-summary').query({ period: 'today' });
  assert.equal(res.status, 200);
  assert.equal(res.body.period, 'today');
  assert.equal(res.body.current.fieldVisitsCount, 1, 'the one real DCR call logged today must be counted');
  assert.ok(res.body.previous, 'a previous-period comparison block must be present');
  assert.equal(res.body.previous.fieldVisitsCount, 0, 'yesterday genuinely had no activity in this fresh fixture');
});
