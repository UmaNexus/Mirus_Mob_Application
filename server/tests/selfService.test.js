import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser, createCompany, getDefaultCompany } from './helpers/factories.js';
import User from '../models/User.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('self-service hub returns a curated overview with reporting manager', async () => {
  const manager = await createUser({
    email: 'mgr@xyz.com', role: 'employee',
    personalDetails: { firstName: 'Priya', lastName: 'Sharma' },
    employeeDetails: { designation: 'Engineering Manager' }
  });

  const { agent } = await authAgent(app, {
    email: 'rahul@xyz.com', role: 'employee',
    personalDetails: { firstName: 'Rahul', lastName: 'Kumar' },
    employeeDetails: { employeeId: 'MMS45872', designation: 'Senior Software Engineer', department: 'Engineering', reportingManagerId: manager._id }
  });

  const res = await agent.get('/api/self-service/overview');
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.fullName, 'Rahul Kumar');
  assert.equal(res.body.profile.employeeId, 'MMS45872');
  assert.equal(res.body.profile.status, 'Active Employee');
  assert.equal(res.body.profile.reportingManager, 'Priya Sharma');
  assert.equal(res.body.latestPayslip, null);
  assert.equal(res.body.onboarding.stage, 'personal');
});

test('hub requires authentication', async () => {
  const res = await (await import('supertest')).default(app).get('/api/self-service/overview');
  assert.equal(res.status, 401);
});

// ---------- Full upward reporting chain (My Team & Reporting) ----------

let n = 0;
const loginAs = async (company, user, password = 'Password1') => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return agent;
};

/** Admin -> NSM -> ZSM -> RSM -> ASM -> BDM, with a logged-in agent at every tier. */
const buildFullChain = async () => {
  n += 1;
  const company = await getDefaultCompany();
  const { agent: adminAgent, user: admin } = await authAgent(app, { company, email: `chain-admin-${n}@xyz.com`, role: 'admin', personalDetails: { firstName: 'Admin', lastName: `Root${n}` } });
  const nsm = await createUser({
    companyId: company._id, email: `chain-nsm-${n}@xyz.com`, personalDetails: { firstName: 'Nina', lastName: 'NSM' },
    employeeDetails: { employeeId: `NSM${n}`, designation: 'National Sales Manager', fieldForce: { tier: 'NSM' }, reportingManagerId: admin._id }
  });
  const zsm = await createUser({
    companyId: company._id, email: `chain-zsm-${n}@xyz.com`, personalDetails: { firstName: 'Zara', lastName: 'ZSM' },
    employeeDetails: { employeeId: `ZSM${n}`, designation: 'Zonal Sales Manager', fieldForce: { tier: 'ZSM' }, reportingManagerId: nsm._id }
  });
  const rsm = await createUser({
    companyId: company._id, email: `chain-rsm-${n}@xyz.com`, personalDetails: { firstName: 'Rohit', lastName: 'RSM' },
    employeeDetails: { employeeId: `RSM${n}`, designation: 'Regional Sales Manager', fieldForce: { tier: 'RSM' }, reportingManagerId: zsm._id }
  });
  const asm = await createUser({
    companyId: company._id, email: `chain-asm-${n}@xyz.com`, personalDetails: { firstName: 'Asha', lastName: 'ASM' },
    employeeDetails: { employeeId: `ASM${n}`, designation: 'Area Sales Manager', fieldForce: { tier: 'ASM' }, reportingManagerId: rsm._id }
  });
  const bdm = await createUser({
    companyId: company._id, email: `chain-bdm-${n}@xyz.com`, personalDetails: { firstName: 'Bharat', lastName: 'BDM' },
    employeeDetails: { employeeId: `BDM${n}`, designation: 'Business Development Manager', fieldForce: { tier: 'BDM' }, reportingManagerId: asm._id }
  });

  const [nsmAgent, zsmAgent, rsmAgent, asmAgent, bdmAgent] = await Promise.all([
    loginAs(company, nsm), loginAs(company, zsm), loginAs(company, rsm), loginAs(company, asm), loginAs(company, bdm)
  ]);
  void adminAgent;

  return { admin, nsm, nsmAgent, zsm, zsmAgent, rsm, rsmAgent, asm, asmAgent, bdm, bdmAgent };
};

test('a BDM sees the complete chain: ASM -> RSM -> ZSM -> NSM -> Admin', async () => {
  const { admin, nsm, zsm, rsm, asm, bdmAgent } = await buildFullChain();
  const res = await bdmAgent.get('/api/self-service/overview');
  assert.equal(res.status, 200);
  const chain = res.body.profile.reportingChain;
  assert.deepEqual(chain.map((m) => m.employeeId), [asm.employeeDetails.employeeId, rsm.employeeDetails.employeeId, zsm.employeeDetails.employeeId, nsm.employeeDetails.employeeId, null]);
  assert.equal(chain[chain.length - 1].role, 'admin');
  assert.equal(chain[chain.length - 1].name, `${admin.personalDetails.firstName} ${admin.personalDetails.lastName}`);
  assert.equal(chain[0].fieldForceTier, 'ASM');
});

test('an ASM sees RSM -> ZSM -> NSM -> Admin (not their own subordinate BDM)', async () => {
  const { rsm, zsm, nsm, asmAgent, bdm } = await buildFullChain();
  const res = await asmAgent.get('/api/self-service/overview');
  const chain = res.body.profile.reportingChain;
  assert.deepEqual(chain.map((m) => m.fieldForceTier || m.role), ['RSM', 'ZSM', 'NSM', 'admin']);
  assert.ok(!chain.some((m) => m.employeeId === bdm.employeeDetails.employeeId), 'never includes a downward subordinate');
});

test('an RSM sees ZSM -> NSM -> Admin', async () => {
  const { rsmAgent } = await buildFullChain();
  const res = await rsmAgent.get('/api/self-service/overview');
  const chain = res.body.profile.reportingChain;
  assert.deepEqual(chain.map((m) => m.fieldForceTier || m.role), ['ZSM', 'NSM', 'admin']);
});

test('an NSM sees only Admin', async () => {
  const { nsmAgent } = await buildFullChain();
  const res = await nsmAgent.get('/api/self-service/overview');
  const chain = res.body.profile.reportingChain;
  assert.equal(chain.length, 1);
  assert.equal(chain[0].role, 'admin');
});

test('missing intermediate levels are skipped, never invented — a BDM reporting straight to an NSM sees BDM -> NSM -> Admin', async () => {
  const company = await getDefaultCompany();
  const { user: admin } = await authAgent(app, { company, email: 'skip-admin@xyz.com', role: 'admin' });
  const nsm = await createUser({ companyId: company._id, email: 'skip-nsm@xyz.com', employeeDetails: { employeeId: 'SKIPNSM', fieldForce: { tier: 'NSM' }, reportingManagerId: admin._id } });
  const bdm = await createUser({ companyId: company._id, email: 'skip-bdm@xyz.com', employeeDetails: { employeeId: 'SKIPBDM', fieldForce: { tier: 'BDM' }, reportingManagerId: nsm._id } });
  const agent = await loginAs(company, bdm);

  const res = await agent.get('/api/self-service/overview');
  const chain = res.body.profile.reportingChain;
  assert.deepEqual(chain.map((m) => m.fieldForceTier || m.role), ['NSM', 'admin']);
});

test('a user from another company never appears in the chain', async () => {
  const companyB = await createCompany({ slug: 'chain-cross-tenant' });
  const foreignManager = await createUser({ companyId: companyB._id, email: 'foreign-mgr@xyz.com', employeeDetails: { fieldForce: { tier: 'ASM' } } });

  // A same-company user who happens to share a raw ObjectId chain that could
  // only resolve if tenant scoping were bypassed — reportingManagerId points
  // at a real user, but in a DIFFERENT company, so it must resolve to nothing.
  const { agent } = await authAgent(app, {
    email: 'lonely@xyz.com',
    employeeDetails: { employeeId: 'LONELY1', fieldForce: { tier: 'BDM' }, reportingManagerId: foreignManager._id }
  });

  const res = await agent.get('/api/self-service/overview');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.profile.reportingChain, []);
});

test('a broken reporting relationship (manager id does not exist) does not crash the page', async () => {
  const { agent } = await authAgent(app, {
    email: 'orphan@xyz.com',
    employeeDetails: { employeeId: 'ORPHAN1', reportingManagerId: '000000000000000000000000' }
  });
  const res = await agent.get('/api/self-service/overview');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.profile.reportingChain, []);
});

test('no reporting manager at all yields an empty chain, not an error', async () => {
  const { agent } = await authAgent(app, { email: 'root-employee@xyz.com' });
  const res = await agent.get('/api/self-service/overview');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.profile.reportingChain, []);
  assert.equal(res.body.profile.reportingManager, null);
});

test('a circular reporting relationship is detected safely — bounded, never an infinite loop or crash', async () => {
  const userA = await createUser({ email: 'circular-a@xyz.com' });
  const { agent } = await authAgent(app, { email: 'circular-b@xyz.com', employeeDetails: { reportingManagerId: userA._id } });
  await User.updateOne({ _id: userA._id }, { $set: { 'employeeDetails.reportingManagerId': (await User.findOne({ email: 'circular-b@xyz.com' }))._id } });

  const res = await agent.get('/api/self-service/overview');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.profile.reportingChain));
  assert.ok(res.body.profile.reportingChain.length <= 8, 'bounded by the walk\'s maxDepth, never unbounded');
});
