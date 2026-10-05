import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import * as db from './helpers/testDb.js';
import { createUser, createCompany, getDefaultCompany, getOrCreateJobRole } from './helpers/factories.js';
import User from '../models/User.js';
import JobRole from '../models/JobRole.js';
import {
  buildPlan, applyMapping, rollbackFromLog, verify, cleanupFieldForce
} from '../scripts/migrate-jobrole.js';

// The company's EXISTING JobRoles (as in production: already present, never created by the app).
const EXISTING_ROLE_NAMES = [
  'Business development manager', 'HR', 'Office admin', 'Area sales manager',
  'Zonal sales manager', 'Regional business manager', 'Accountant', 'Office assistant'
];

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

let n = 0;
const email = (p) => `${p}_${++n}@xyz.com`;
const raw = (id) => User.collection.findOne({ _id: id });

/** Production-like company: the exact 8 JobRoles, plus a handful of users with real-world designations. */
const seedFixture = async () => {
  const company = await getDefaultCompany();
  for (const [i, name] of EXISTING_ROLE_NAMES.entries()) await getOrCreateJobRole(company._id, name, { sortOrder: i });
  const mgr = await createUser({ companyId: company._id, email: email('mgr') });
  const matched = await createUser({ companyId: company._id, email: email('m'), employeeDetails: { designation: '  area SALES manager ', reportingManagerId: mgr._id } });
  const unmatched = await createUser({ companyId: company._id, email: email('u'), employeeDetails: { designation: 'Regional development manager' } });
  const noDesignation = await createUser({ companyId: company._id, email: email('nd') });
  const done = await createUser({ companyId: company._id, email: email('d'), employeeDetails: { designation: 'x', jobRole: (await JobRole.findOne({ companyId: company._id, name: 'HR' }))._id } });
  // Production users carry employeeDetails.fieldForce = { tier: null, territory: null }.
  await User.collection.updateMany({ companyId: company._id }, { $set: { 'employeeDetails.fieldForce': { tier: null, territory: null } } });
  return { company, mgr, matched, unmatched, noDesignation, done };
};

test('report classifies users deterministically and writes nothing', async () => {
  const { company, matched, unmatched, noDesignation, done } = await seedFixture();
  const snap = async () => JSON.stringify([await User.collection.find().sort({ _id: 1 }).toArray(), await JobRole.find().sort('_id').lean()]);
  const before = await snap();
  const plan = await buildPlan(company._id);
  await verify(company._id);
  const st = Object.fromEntries(plan.rows.map((r) => [r.userId, r.status]));
  assert.equal(st[String(matched._id)], 'MAPPED');
  assert.equal(st[String(unmatched._id)], 'UNMAPPED');
  assert.equal(st[String(noDesignation._id)], 'UNMAPPED');
  assert.equal(st[String(done._id)], 'ALREADY_MAPPED');
  assert.equal(plan.proposedMapping.length, 1);
  assert.equal(plan.proposedMapping[0].jobRoleName, 'Area sales manager');
  assert.equal(await snap(), before, 'report/verify must not modify data');
});

test('ambiguous designations (case-variant duplicate role names) are reported, never guessed', async () => {
  const company = await getDefaultCompany();
  await getOrCreateJobRole(company._id, 'Area sales manager');
  await JobRole.collection.insertOne({ companyId: company._id, name: 'AREA SALES MANAGER', active: true, sortOrder: 0 });
  const u = await createUser({ companyId: company._id, email: email('a'), employeeDetails: { designation: 'area sales manager' } });
  const plan = await buildPlan(company._id);
  assert.equal(plan.rows.find((r) => r.userId === String(u._id)).status, 'AMBIGUOUS');
  assert.equal(plan.proposedMapping.length, 0);
});

test('apply writes only employeeDetails.jobRole, never overwrites, and is idempotent', async () => {
  const { company, matched, unmatched, noDesignation } = await seedFixture();
  const plan = await buildPlan(company._id);
  const rolesBefore = await JobRole.countDocuments();
  const beforeDoc = await raw(matched._id);

  const r1 = await applyMapping(company._id, plan.proposedMapping);
  assert.deepEqual(r1.map((r) => r.result), ['SET']);
  const afterDoc = await raw(matched._id);
  assert.equal(String(afterDoc.employeeDetails.jobRole), plan.proposedMapping[0].jobRoleId);
  // Every other field is byte-identical.
  const strip = (d) => { const c = JSON.parse(JSON.stringify(d)); delete c.employeeDetails.jobRole; delete c.updatedAt; return c; };
  assert.deepEqual(strip(afterDoc), strip(beforeDoc));
  assert.equal(String(afterDoc.employeeDetails.reportingManagerId), String(beforeDoc.employeeDetails.reportingManagerId));
  assert.equal(afterDoc.employeeDetails.designation, beforeDoc.employeeDetails.designation);
  assert.equal(afterDoc.role, beforeDoc.role);
  assert.equal((await raw(unmatched._id)).employeeDetails.jobRole ?? null, null);
  assert.equal((await raw(noDesignation._id)).employeeDetails.jobRole ?? null, null);
  assert.equal(await JobRole.countDocuments(), rolesBefore);

  const r2 = await applyMapping(company._id, plan.proposedMapping);
  assert.deepEqual(r2.map((r) => r.result), ['UNCHANGED_ALREADY_SET']);
  assert.equal((await buildPlan(company._id)).proposedMapping.length, 0);
});

test('apply never overwrites an existing different jobRole (partial migration)', async () => {
  const { company, done } = await seedFixture();
  const other = await JobRole.findOne({ companyId: company._id, name: 'Accountant' });
  const before = String((await raw(done._id)).employeeDetails.jobRole);
  const res = await applyMapping(company._id, [{ userId: String(done._id), jobRoleId: String(other._id) }]);
  assert.equal(res[0].result, 'SKIPPED_HAS_DIFFERENT_JOBROLE');
  assert.equal(String((await raw(done._id)).employeeDetails.jobRole), before);
});

test('migration is tenant-scoped: foreign JobRole / foreign user / bad ids / inactive role are rejected', async () => {
  const { company, matched } = await seedFixture();
  const other = await createCompany();
  const foreignRole = await getOrCreateJobRole(other._id, 'Area sales manager');
  const foreignUser = await createUser({ companyId: other._id, email: email('fu') });
  const mine = await JobRole.findOne({ companyId: company._id, name: 'Accountant' });
  const inactive = await getOrCreateJobRole(company._id, 'Retired', { active: false });
  const res = await applyMapping(company._id, [
    { userId: String(matched._id), jobRoleId: String(foreignRole._id) },
    { userId: String(foreignUser._id), jobRoleId: String(mine._id) },
    { userId: 'nope', jobRoleId: 'nope' },
    { userId: String(matched._id), jobRoleId: String(inactive._id) }
  ]);
  assert.deepEqual(res.map((r) => r.result), [
    'SKIPPED_JOBROLE_NOT_IN_COMPANY_OR_INACTIVE', 'SKIPPED_USER_NOT_IN_COMPANY', 'SKIPPED_INVALID_ID', 'SKIPPED_JOBROLE_NOT_IN_COMPANY_OR_INACTIVE'
  ]);
  assert.equal((await raw(foreignUser._id)).employeeDetails.jobRole ?? null, null);
  assert.equal((await raw(matched._id)).employeeDetails.jobRole ?? null, null);
});

test('dry-run writes nothing; rollback reverts only the values written by that apply log', async () => {
  const { company, matched } = await seedFixture();
  const plan = await buildPlan(company._id);
  const dry = await applyMapping(company._id, plan.proposedMapping, { dryRun: true });
  assert.equal(dry[0].result, 'WOULD_SET');
  assert.equal((await raw(matched._id)).employeeDetails.jobRole ?? null, null);

  const applied = await applyMapping(company._id, plan.proposedMapping);
  const bystander = await createUser({ companyId: company._id, email: email('by'), employeeDetails: { jobRole: plan.proposedMapping[0].jobRoleId } });
  const reassigned = await JobRole.findOne({ companyId: company._id, name: 'Accountant' });
  await User.updateOne({ _id: matched._id }, { $set: { 'employeeDetails.jobRole': reassigned._id } });
  assert.deepEqual((await rollbackFromLog(company._id, { results: applied })).map((r) => r.result), ['UNCHANGED']);
  assert.equal(String((await raw(matched._id)).employeeDetails.jobRole), String(reassigned._id));
  assert.ok((await raw(bystander._id)).employeeDetails.jobRole);

  // A clean rollback of an untouched apply reverts exactly that value.
  await User.updateOne({ _id: matched._id }, { $set: { 'employeeDetails.jobRole': null } });
  const again = await applyMapping(company._id, plan.proposedMapping);
  assert.deepEqual((await rollbackFromLog(company._id, { results: again })).map((r) => r.result), ['REVERTED']);
  assert.equal((await raw(matched._id)).employeeDetails.jobRole ?? null, null);
});

test('broken (dangling) jobRole is reported, not modified', async () => {
  const company = await getDefaultCompany();
  const u = await createUser({ companyId: company._id, email: email('b'), employeeDetails: { jobRole: new mongoose.Types.ObjectId() } });
  const plan = await buildPlan(company._id);
  assert.equal(plan.rows.find((r) => r.userId === String(u._id)).status, 'BROKEN_JOBROLE');
  assert.ok((await raw(u._id)).employeeDetails.jobRole);
});

// ---------- stage 2: remove employeeDetails.fieldForce ----------

test('cleanup is a dry run unless --confirm, refuses while mappings are pending, and then only unsets fieldForce', async () => {
  const { company, matched, unmatched } = await seedFixture();
  const withField = async () => User.collection.countDocuments({ companyId: company._id, 'employeeDetails.fieldForce': { $exists: true } });
  const total = await withField();
  assert.ok(total > 0);

  // A proposed mapping has not been applied yet => refuse.
  const refused = await cleanupFieldForce(company._id, { confirm: true });
  assert.ok(refused.refused.length > 0);
  assert.equal(await withField(), total, 'nothing removed while refused');

  await applyMapping(company._id, (await buildPlan(company._id)).proposedMapping);
  const before = await raw(unmatched._id);
  const dry = await cleanupFieldForce(company._id, { confirm: false });
  assert.equal(dry.dryRun, true);
  assert.equal(await withField(), total, 'dry run removes nothing');

  const done = await cleanupFieldForce(company._id, { confirm: true });
  assert.deepEqual(done.refused, []);
  assert.equal(done.modified, total);
  assert.equal(await withField(), 0);
  const after = await raw(unmatched._id);
  const strip = (d) => { const c = JSON.parse(JSON.stringify(d)); delete c.employeeDetails.fieldForce; delete c.updatedAt; return c; };
  assert.deepEqual(strip(after), strip(before), 'only employeeDetails.fieldForce was removed');
  assert.ok((await raw(matched._id)).employeeDetails.jobRole, 'jobRole values are kept');

  // Idempotent.
  assert.equal((await cleanupFieldForce(company._id, { confirm: true })).modified, 0);
});

test('cleanup refuses to discard meaningful legacy tier/territory data, and never touches another company', async () => {
  const { company, matched } = await seedFixture();
  await applyMapping(company._id, (await buildPlan(company._id)).proposedMapping);
  await User.collection.updateOne({ _id: matched._id }, { $set: { 'employeeDetails.fieldForce': { tier: 'ASM', territory: 'Pune' } } });
  const other = await createCompany();
  const otherUser = await createUser({ companyId: other._id, email: email('o') });
  await User.collection.updateOne({ _id: otherUser._id }, { $set: { 'employeeDetails.fieldForce': { tier: null, territory: null } } });

  const res = await cleanupFieldForce(company._id, { confirm: true });
  assert.ok(res.refused.some((r) => /legacy tier\/territory/.test(r)));
  assert.ok((await raw(matched._id)).employeeDetails.fieldForce, 'meaningful data kept');

  await User.collection.updateOne({ _id: matched._id }, { $set: { 'employeeDetails.fieldForce': { tier: null, territory: null } } });
  assert.equal((await cleanupFieldForce(company._id, { confirm: true })).refused.length, 0);
  assert.ok((await raw(otherUser._id)).employeeDetails.fieldForce, 'other company untouched');
});
