import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser } from './helpers/factories.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

const adminAgent = () => authAgent(app, { email: 'admin@xyz.com', role: 'admin' });

const TEMPLATE = {
  name: 'Engineering-V2',
  earningsStructure: [
    { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 },
    { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 50 },
    { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
  ],
  deductionsStructure: [
    { key: 'pf', label: 'PF', calculationType: 'percentage_of_basic', valueFactor: 12 },
    { key: 'pt', label: 'PT', calculationType: 'fixed', valueFactor: 20000 }
  ]
};

const seedTemplate = async (agent) => {
  const res = await agent.post('/api/salary-templates').send(TEMPLATE);
  assert.equal(res.status, 201);
  return res.body.template;
};

test('template CRUD lifecycle', async () => {
  const { agent } = await adminAgent();
  const tpl = await seedTemplate(agent);

  const list = await agent.get('/api/salary-templates');
  assert.equal(list.body.data.length, 1);

  const upd = await agent.put(`/api/salary-templates/${tpl._id}`).send({ description: 'updated' });
  assert.equal(upd.body.template.description, 'updated');

  const del = await agent.delete(`/api/salary-templates/${tpl._id}`);
  assert.equal(del.status, 200);

  const after = await agent.get(`/api/salary-templates/${tpl._id}`);
  assert.equal(after.body.template.isActive, false);
});

test('creating a template requires a name', async () => {
  const { agent } = await adminAgent();
  const res = await agent.post('/api/salary-templates').send({ earningsStructure: [] });
  assert.equal(res.status, 400);
});

test('assign salary freezes a computed breakdown in paisa', async () => {
  const { agent } = await adminAgent();
  const tpl = await seedTemplate(agent);
  const emp = await createUser({ email: 'eng@xyz.com', role: 'employee' });

  const res = await agent.post('/api/salary-assignments')
    .send({ userId: emp._id, templateId: tpl._id, annualCTC: 1200000 });
  assert.equal(res.status, 201);
  assert.equal(res.body.assignment.annualCTC, 120000000); // rupees -> paisa
  assert.equal(res.body.assignment.frozenMonthlyBreakdown.netTakeHome, 9440000);
});

test('cannot deactivate a template assigned to an employee', async () => {
  const { agent } = await adminAgent();
  const tpl = await seedTemplate(agent);
  const emp = await createUser({ email: 'on-tpl@xyz.com', role: 'employee', isActive: true });
  await agent.post('/api/salary-assignments')
    .send({ userId: emp._id, templateId: tpl._id, annualCTC: 1200000 });

  const del = await agent.delete(`/api/salary-templates/${tpl._id}`);
  assert.equal(del.status, 409);
  assert.match(del.body.message, /assigned/i);

  const viaPut = await agent.put(`/api/salary-templates/${tpl._id}`).send({ isActive: false });
  assert.equal(viaPut.status, 409);

  const still = await agent.get(`/api/salary-templates/${tpl._id}`);
  assert.equal(still.body.template.isActive, true);
});

test('inactive template can be permanently deleted when unused', async () => {
  const { agent } = await adminAgent();
  const tpl = await seedTemplate(agent);

  const activeDelete = await agent.delete(`/api/salary-templates/${tpl._id}/permanent`);
  assert.equal(activeDelete.status, 400);

  assert.equal((await agent.delete(`/api/salary-templates/${tpl._id}`)).status, 200);

  const gone = await agent.delete(`/api/salary-templates/${tpl._id}/permanent`);
  assert.equal(gone.status, 200);
  assert.equal((await agent.get(`/api/salary-templates/${tpl._id}`)).status, 404);
});

test('payslip generation creates idempotent slips and employees can list/download their own', async () => {
  const { agent } = await adminAgent();
  const tpl = await seedTemplate(agent);
  const { user: emp, agent: empAgent } = await authAgent(app, {
    email: 'rahul@xyz.com', role: 'employee',
    employeeDetails: { employeeId: 'MMS100', designation: 'SE', department: 'Engineering' }
  });

  await agent.post('/api/salary-assignments').send({ userId: emp._id, templateId: tpl._id, annualCTC: 1200000 });

  const gen = await agent.post('/api/payslips/generate').send({ month: 6, year: 2026, employeeIds: [emp._id] });
  assert.equal(gen.status, 201);
  assert.equal(gen.body.generated.length, 1);

  // Re-running the same period must not create a duplicate (unique index).
  const regen = await agent.post('/api/payslips/generate').send({ month: 6, year: 2026, employeeIds: [emp._id] });
  assert.equal(regen.body.generated.length, 1);
  const all = await agent.get('/api/payslips').query({ month: 6, year: 2026 });
  assert.equal(all.body.pagination.total, 1);

  const mine = await empAgent.get('/api/payslips/mine');
  assert.equal(mine.body.data.length, 1);
  assert.equal(mine.body.data[0].financialSummary.netPayInWords.length > 0, true);

  const slipId = mine.body.data[0]._id;
  const pdf = await empAgent.get(`/api/payslips/${slipId}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
});

test('an employee cannot download another employee\'s payslip', async () => {
  const { agent } = await adminAgent();
  const tpl = await seedTemplate(agent);
  const victim = await createUser({ email: 'victim@xyz.com', role: 'employee' });
  await agent.post('/api/salary-assignments').send({ userId: victim._id, templateId: tpl._id, annualCTC: 1200000 });
  const gen = await agent.post('/api/payslips/generate').send({ month: 5, year: 2026, employeeIds: [victim._id] });
  const slipId = gen.body.generated[0].slipId;

  const { agent: intruder } = await authAgent(app, { email: 'intruder@xyz.com', role: 'employee' });
  const res = await intruder.get(`/api/payslips/${slipId}/pdf`);
  assert.equal(res.status, 403);
});
