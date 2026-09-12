import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from './helpers/testDb.js';
import app from '../app.js';
import { authAgent, createUser } from './helpers/factories.js';
import OfferLetter from '../models/OfferLetter.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';

before(async () => { await db.connect(); });
after(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); });

test('dashboard stats are admin/HR only', async () => {
  const { agent } = await authAgent(app, { email: 'emp@xyz.com', role: 'employee' });
  const res = await agent.get('/api/dashboard/stats');
  assert.equal(res.status, 403);
});

test('dashboard totalEmployees counts provisioned active employees', async () => {
  const { agent, company } = await authAgent(app, { email: 'admin@xyz.com', role: 'admin' });
  const cid = company._id;

  const tpl = await SalaryStructureTemplate.create({ companyId: cid, name: 'T', earningsStructure: [], deductionsStructure: [] });

  // Provisioned active employee — counts.
  const e1 = await createUser({
    email: 'e1@xyz.com', role: 'employee', isActive: true,
    employeeDetails: { employeeId: 'MMS10001' }
  });
  await EmployeeSalaryAssignment.create({
    companyId: cid, userId: e1._id, templateId: tpl._id, annualCTC: 1200000,
    frozenMonthlyBreakdown: { earnings: [], deductions: [], grossEarnings: 0, totalDeductions: 0, netTakeHome: 0 }
  });
  await OfferLetter.create({
    companyId: cid, candidateEmail: 'e1@xyz.com', fullName: 'E One', position: 'Dev', department: 'Engineering',
    joiningDate: new Date(), salaryAssignmentId: (await EmployeeSalaryAssignment.findOne({ userId: e1._id }))._id,
    status: 'accepted', pdfFileUrl: 'uploads/offers/o1.pdf'
  });

  // Employee with pending doc verification + employee id — still counts.
  const e2 = await createUser({
    email: 'e2@xyz.com', role: 'employee', isActive: true,
    employeeDetails: { employeeId: 'MMS10002' },
    uploadedDocuments: [{ documentType: 'PAN', documentNumber: 'ABCDE1234F', fileUrl: 'uploads/documents/x.pdf', verificationStatus: 'Pending' }]
  });
  await EmployeeSalaryAssignment.create({
    companyId: cid, userId: e2._id, templateId: tpl._id, annualCTC: 1200000,
    frozenMonthlyBreakdown: { earnings: [], deductions: [], grossEarnings: 0, totalDeductions: 0, netTakeHome: 0 }
  });

  // Staged candidate without employee id — must NOT inflate headcount.
  const u = await createUser({ email: 'cand@xyz.com', role: 'employee', isActive: false });
  const asn = await EmployeeSalaryAssignment.create({
    companyId: cid, userId: u._id, templateId: tpl._id, annualCTC: 1200000,
    frozenMonthlyBreakdown: { earnings: [], deductions: [], grossEarnings: 0, totalDeductions: 0, netTakeHome: 0 }
  });
  await OfferLetter.create({
    companyId: cid, candidateEmail: 'cand@xyz.com', fullName: 'Cand', position: 'Dev', department: 'Engineering',
    joiningDate: new Date(), salaryAssignmentId: asn._id, status: 'sent', pdfFileUrl: 'uploads/offers/o.pdf'
  });

  const res = await agent.get('/api/dashboard/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.stats.totalEmployees, 2); // e1 + e2 only; cand excluded
  assert.equal(res.body.stats.pendingOffers, 1);
  assert.equal(res.body.stats.pendingVerifications, 1);
});
