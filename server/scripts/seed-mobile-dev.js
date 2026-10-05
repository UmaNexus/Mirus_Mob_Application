import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { runWithStore } from '../utils/tenantContext.js';
import Company from '../models/Company.js';
import { DEV_PERSONA_ROLE_NAMES, ensureJobRoleId } from './lib/devJobRoles.js';
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import DailyCallReport from '../models/DailyCallReport.js';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import Expense from '../models/Expense.js';
import WorkType from '../models/WorkType.js';
import Stockist from '../models/Stockist.js';
import SecondarySale from '../models/SecondarySale.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';

/**
 * Additive, idempotent dev-only seed for manually testing the mobile
 * field-force app + manager/admin hierarchy screens against the real Docker
 * development MongoDB (never the client/production database — this only
 * ever touches a brand-new `dev` company, never the pre-existing companies
 * already in this database).
 *
 * Safe to re-run: every write is a find-by-stable-key upsert, never a blind
 * create, and nothing here ever deletes/drops/truncates anything. Business
 * hierarchy visibility (who can see whose data) is produced entirely via the
 * existing `employeeDetails.reportingManagerId` chain and the existing
 * fieldForceAuth authorization helpers — no authorization bypass.
 *
 * Run with: npm run db:seed:mobile-dev
 */

const DEV_COMPANY_SLUG = 'dev';
const DEV_COMPANY_NAME = 'Dev Field Force Co';
const DEV_PASSWORD = 'DevTest123!';

const stats = { created: {}, existing: {} };
const mark = (bucket, label) => { stats[bucket][label] = (stats[bucket][label] || 0) + 1; };

const dateKey = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCHours(9, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};
const currentMonth = () => new Date().toISOString().slice(0, 7);

const devAddress = { street: '221B Field Office Road', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500034' };

async function upsertCompany(slug, name) {
  let company = await Company.findOne({ slug });
  if (company) {
    mark('existing', 'Company');
    return company;
  }
  company = await Company.create({ slug, name, status: 'active' });
  mark('created', 'Company');
  return company;
}

async function upsertUser(company, { email, role, firstName, lastName, gender, dob, persona, employeeId, reportingManagerId }) {
  let user = await User.findOne({ companyId: company._id, email });
  const jobRole = persona ? await ensureJobRoleId(company._id, DEV_PERSONA_ROLE_NAMES[persona]) : null;

  if (user) {
    user.password = DEV_PASSWORD; // re-hashed by the User pre-save hook
    user.isActive = true;
    user.role = role;
    user.employeeDetails = user.employeeDetails || {};
    user.employeeDetails.reportingManagerId = reportingManagerId || null;
    user.employeeDetails.jobRole = jobRole;
    if (employeeId) user.employeeDetails.employeeId = employeeId;
    await user.save();
    mark('existing', 'User');
    return user;
  }

  user = await User.create({
    companyId: company._id,
    email,
    password: DEV_PASSWORD,
    role,
    isActive: true,
    onboardingStage: 'completed',
    personalDetails: { firstName, lastName, dateOfBirth: dob, gender },
    contactInfo: {
      personalMobile: '9000000000',
      emergencyContactName: 'Dev Emergency Contact',
      emergencyContactRelation: 'Friend',
      emergencyContactPhone: '9000000001',
      presentAddress: devAddress,
      permanentAddress: devAddress
    },
    employeeDetails: {
      employeeId: employeeId || undefined,
      reportingManagerId: reportingManagerId || null,
      jobRole
    }
  });
  mark('created', 'User');
  return user;
}

async function upsertDoc(Model, label, filter, buildDoc) {
  let doc = await Model.findOne(filter);
  if (doc) {
    mark('existing', label);
    return doc;
  }
  doc = await Model.create(await buildDoc());
  mark('created', label);
  return doc;
}

async function upsertDoctor(companyId, createdBy, assignedTo, { name, speciality, area, phone, dob, anniversaryDate }) {
  return upsertDoc(Doctor, 'Doctor', { companyId, name, assignedTo }, () => ({
    companyId, name, speciality, area, phone, dob: dob || null, anniversaryDate: anniversaryDate || null, assignedTo, createdBy
  }));
}

async function upsertAttendance(companyId, userId, date, { status, checkIn, checkOut, punchInAt, punchOutAt, workedHours }) {
  const key = dateKey(date);
  return upsertDoc(Attendance, 'Attendance', { companyId, userId, dateKey: key }, () => ({
    companyId, userId, dateKey: key, date, status, checkIn, checkOut, punchInAt, punchOutAt, workedHours: workedHours || 0
  }));
}

async function upsertWorkType(companyId, userId, date, { type, details, linkedLeaveRequestId }) {
  const key = dateKey(date);
  return upsertDoc(WorkType, 'WorkType', { companyId, userId, dateKey: key }, () => ({
    companyId, userId, dateKey: key, date, type, details: details || {}, linkedLeaveRequestId: linkedLeaveRequestId || null
  }));
}

async function upsertDcr(companyId, userId, date, doctorId, { type, accompaniedBy, feedback, productsDetailed }) {
  const key = dateKey(date);
  return upsertDoc(DailyCallReport, 'DailyCallReport', { companyId, userId, dateKey: key, doctorId, type }, () => ({
    companyId, userId, dateKey: key, date, type, doctorId, accompaniedBy: accompaniedBy || null,
    productsDetailed: productsDetailed || [], feedback: feedback || '', visitTime: date, submittedAt: date
  }));
}

async function upsertMtp(companyId, userId, { status, approverId, remarks }) {
  const month = currentMonth();
  let plan = await MonthlyTourPlan.findOne({ companyId, userId, month });
  if (plan) {
    mark('existing', 'MonthlyTourPlan');
    return plan;
  }
  plan = await MonthlyTourPlan.create({
    companyId, userId, month, status, approverId: approverId || null, remarks: remarks || '',
    submittedAt: status !== 'draft' ? daysAgo(5) : null,
    decidedAt: status === 'approved' ? daysAgo(3) : null,
    decisionNote: status === 'approved' ? 'Looks good, approved.' : ''
  });
  mark('created', 'MonthlyTourPlan');
  return plan;
}

async function upsertExpense(companyId, userId, { category, date, amount, status, approverId, from, to }) {
  return upsertDoc(Expense, 'Expense', { companyId, userId, date, category }, () => ({
    companyId, userId, category, date, amount, from: from || '', to: to || '',
    modeOfTravel: category === 'Travel' ? 'Own vehicle' : '',
    status, approverId: status !== 'pending' ? approverId : null,
    decidedAt: status !== 'pending' ? daysAgo(2) : null,
    decisionNote: status === 'approved' ? 'Approved.' : status === 'rejected' ? 'Missing receipt.' : ''
  }));
}

async function upsertStockist(companyId, userId, { name, area, lastOrderAmount, lastOrderDate }) {
  return upsertDoc(Stockist, 'Stockist', { companyId, userId, name }, () => ({
    companyId, userId, name, area, lastOrderAmount, lastOrderDate, status: 'Active'
  }));
}

async function upsertSecondarySale(companyId, userId, stockistId, { productName, batchNumber, expiryDate, quantity, value }) {
  return upsertDoc(SecondarySale, 'SecondarySale', { companyId, userId, productName, batchNumber }, () => ({
    companyId, userId, stockistId: stockistId || null, productName, batchNumber, expiryDate, quantity, value
  }));
}

async function upsertLeaveRequest(companyId, userId, { type, fromDate, toDate, days, status, approverId }) {
  return upsertDoc(LeaveRequest, 'LeaveRequest', { companyId, userId, type, fromDate, toDate }, () => ({
    companyId, userId, type, fromDate, toDate, days, reason: 'Personal work',
    status, approverId: status !== 'Pending' ? approverId : null,
    decidedAt: status !== 'Pending' ? daysAgo(6) : null,
    decisionNote: status === 'Approved' ? 'Approved.' : ''
  }));
}

async function seedBusinessData({ companyId, bdm, bdm2, asm, rsm }) {
  // --- Doctors assigned to the primary BDM, clustered into areas (so the
  // MTP area-first planning flow has more than one doctor per area to pick
  // from — additive: existing doctors from earlier seed runs are left as-is,
  // these are new names only). ---
  const doctorSpecs = [
    { name: 'Dr. Ananya Rao', speciality: 'Cardiology', area: 'Banjara Hills', phone: '9812300001', dob: new Date('1978-04-12'), anniversaryDate: new Date('2005-11-20') },
    { name: 'Dr. Vikram Sethi', speciality: 'Orthopedics', area: 'Jubilee Hills', phone: '9812300002', dob: new Date('1982-09-03') },
    { name: 'Dr. Priya Menon', speciality: 'Pediatrics', area: 'Madhapur', phone: '9812300003', dob: new Date('1985-01-25') },
    { name: 'Dr. Farhan Ahmed', speciality: 'General Medicine', area: 'Kondapur', phone: '9812300004' },
    { name: 'Dr. Sneha Kulkarni', speciality: 'Dermatology', area: 'Gachibowli', phone: '9812300005' },
    { name: 'Dr. Kiran Shah', speciality: 'Diabetologist', area: 'Banjara Hills', phone: '9812300007' },
    { name: 'Dr. Neha Patel', speciality: 'Dermatologist', area: 'Jubilee Hills', phone: '9812300008' }
  ];
  const doctors = [];
  for (const spec of doctorSpecs) {
    doctors.push(await upsertDoctor(companyId, asm._id, bdm._id, spec));
  }

  // --- Attendance + WorkType for the last 9 days (mixed statuses) ---
  const attendanceDays = [];
  for (let i = 8; i >= 0; i -= 1) {
    const date = daysAgo(i);
    const dow = date.getUTCDay();
    if (dow === 0) {
      await upsertAttendance(companyId, bdm._id, date, { status: 'WeekOff' });
      continue;
    }
    if (i === 3) {
      await upsertAttendance(companyId, bdm._id, date, { status: 'Half-Day', checkIn: '09:15', checkOut: '13:30', workedHours: 4.25 });
    } else if (i === 6) {
      await upsertAttendance(companyId, bdm._id, date, { status: 'Leave' });
    } else {
      const punchInAt = new Date(date); punchInAt.setUTCHours(9, 20, 0, 0);
      const punchOutAt = new Date(date); punchOutAt.setUTCHours(18, 10, 0, 0);
      await upsertAttendance(companyId, bdm._id, date, { status: 'Present', checkIn: '09:20', checkOut: '18:10', punchInAt, punchOutAt, workedHours: 8.83 });
      attendanceDays.push(date);
    }
  }

  // --- WorkType + DCR entries on worked days ---
  for (const [idx, date] of attendanceDays.entries()) {
    const doctor = doctors[idx % doctors.length];
    const isJoint = idx === 1;
    await upsertWorkType(companyId, bdm._id, date, {
      type: isJoint ? 'jointcall' : 'individual',
      details: { doctorId: String(doctor._id), area: doctor.area, accompaniedBy: isJoint ? String(asm._id) : undefined }
    });
    await upsertDcr(companyId, bdm._id, date, doctor._id, {
      type: isJoint ? 'joint' : 'individual',
      accompaniedBy: isJoint ? asm._id : null,
      feedback: 'Positive response, follow-up planned next visit.',
      productsDetailed: ['Cardivax 5mg', 'Ostilex 10mg']
    });
  }
  // One missed call for variety
  await upsertDcr(companyId, bdm._id, daysAgo(7), doctors[0]._id, { type: 'missed', feedback: 'Doctor unavailable, rescheduled.' });

  // --- Monthly Tour Plan ---
  await upsertMtp(companyId, bdm._id, { status: 'approved', approverId: asm._id, remarks: 'Focus on Banjara Hills + Jubilee Hills cluster.' });

  // --- Expenses ---
  await upsertExpense(companyId, bdm._id, { category: 'Travel', date: daysAgo(1), amount: 45000, status: 'approved', approverId: asm._id, from: 'Home', to: 'Banjara Hills' });
  await upsertExpense(companyId, bdm._id, { category: 'Food', date: daysAgo(2), amount: 25000, status: 'approved', approverId: asm._id });
  await upsertExpense(companyId, bdm._id, { category: 'Stay', date: daysAgo(4), amount: 180000, status: 'pending' });
  await upsertExpense(companyId, bdm._id, { category: 'Internet', date: daysAgo(5), amount: 15000, status: 'rejected', approverId: asm._id });

  // --- Stockists + Secondary Sales (with expiry-alert coverage) ---
  const stockistA = await upsertStockist(companyId, bdm._id, { name: 'Mehta Pharma Distributors', area: 'Banjara Hills', lastOrderAmount: 5200000, lastOrderDate: daysAgo(3) });
  const stockistB = await upsertStockist(companyId, bdm._id, { name: 'Sri Balaji Agencies', area: 'Madhapur', lastOrderAmount: 1800000, lastOrderDate: daysAgo(10) });

  const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d; };
  await upsertSecondarySale(companyId, bdm._id, stockistA._id, { productName: 'Cardivax 5mg', batchNumber: 'CDX-2024-11', expiryDate: inDays(-10), quantity: 40, value: 800000 }); // already expired
  await upsertSecondarySale(companyId, bdm._id, stockistA._id, { productName: 'Ostilex 10mg', batchNumber: 'OST-2025-03', expiryDate: inDays(15), quantity: 60, value: 1200000 }); // expiring soon
  await upsertSecondarySale(companyId, bdm._id, stockistB._id, { productName: 'Dermacare Cream', batchNumber: 'DRM-2025-07', expiryDate: inDays(180), quantity: 25, value: 400000 }); // healthy

  // --- Leave request (visible on calendar, approved by reporting manager) ---
  await upsertLeaveRequest(companyId, bdm._id, {
    type: 'Casual', fromDate: daysAgo(6), toDate: daysAgo(6), days: 1, status: 'Approved', approverId: asm._id
  });

  // --- A second, lighter BDM under the same ASM so manager "team" screens show >1 report ---
  const doctor2 = await upsertDoctor(companyId, asm._id, bdm2._id, { name: 'Dr. Rahul Verma', speciality: 'ENT', area: 'Kukatpally', phone: '9812300006' });
  await upsertAttendance(companyId, bdm2._id, daysAgo(1), { status: 'Present', checkIn: '09:10', checkOut: '17:50', workedHours: 8.67 });
  await upsertDcr(companyId, bdm2._id, daysAgo(1), doctor2._id, { type: 'individual', feedback: 'Introductory visit, samples given.' });
  await upsertStockist(companyId, bdm2._id, { name: 'Kukatpally Medical Agencies', area: 'Kukatpally', lastOrderAmount: 900000, lastOrderDate: daysAgo(8) });
  await upsertMtp(companyId, bdm2._id, { status: 'pending', remarks: 'Draft plan for review.' });

  // --- One manager-own field call for the ASM (fills in when no BDM is assigned) ---
  const { default: ManagerFieldCall } = await import('../models/ManagerFieldCall.js');
  await upsertDoc(ManagerFieldCall, 'ManagerFieldCall', { companyId, userId: asm._id, contactName: 'Dr. Kavita Iyer' }, () => ({
    companyId, userId: asm._id, jobRoleName: DEV_PERSONA_ROLE_NAMES.ASM, area: 'Secunderabad', visitType: 'Doctor',
    contactName: 'Dr. Kavita Iyer', speciality: 'Gynaecology', productsDetailed: ['Cardivax 5mg'],
    reason: 'No BDM assigned', feedback: 'Territory currently uncovered, manager visited directly.', loggedAt: daysAgo(2)
  }));
}

async function run() {
  await connectDB();

  const company = await upsertCompany(DEV_COMPANY_SLUG, DEV_COMPANY_NAME);

  const admin = await upsertUser(company, {
    email: 'admin@dev.test', role: 'admin', firstName: 'Ava', lastName: 'Admin', gender: 'Female', dob: new Date('1980-01-01'), employeeId: 'DEV-ADMIN-001'
  });
  const nsm = await upsertUser(company, {
    email: 'nsm@dev.test', role: 'employee', firstName: 'Nikhil', lastName: 'Nair', gender: 'Male', dob: new Date('1975-06-15'),
    persona: 'ZSM', employeeId: 'DEV-NSM-001', reportingManagerId: admin._id
  });
  const zsm = await upsertUser(company, {
    email: 'zsm@dev.test', role: 'employee', firstName: 'Zara', lastName: 'Shaikh', gender: 'Female', dob: new Date('1979-03-22'),
    persona: 'ZSM', employeeId: 'DEV-ZSM-001', reportingManagerId: nsm._id
  });
  const rsm = await upsertUser(company, {
    email: 'rsm@dev.test', role: 'employee', firstName: 'Rohit', lastName: 'Sharma', gender: 'Male', dob: new Date('1983-08-09'),
    persona: 'RSM', employeeId: 'DEV-RSM-001', reportingManagerId: zsm._id
  });
  const asm = await upsertUser(company, {
    email: 'asm@dev.test', role: 'employee', firstName: 'Asha', lastName: 'Mehra', gender: 'Female', dob: new Date('1987-02-14'),
    persona: 'ASM', employeeId: 'DEV-ASM-001', reportingManagerId: rsm._id
  });
  const bdm = await upsertUser(company, {
    email: 'bdm@dev.test', role: 'employee', firstName: 'Bharat', lastName: 'Desai', gender: 'Male', dob: new Date('1995-11-30'),
    persona: 'BDM', employeeId: 'DEV-BDM-001', reportingManagerId: asm._id
  });
  const bdm2 = await upsertUser(company, {
    email: 'bdm2@dev.test', role: 'employee', firstName: 'Bhavana', lastName: 'Reddy', gender: 'Female', dob: new Date('1996-05-18'),
    persona: 'BDM', employeeId: 'DEV-BDM-002', reportingManagerId: asm._id
  });

  await runWithStore({ companyId: String(company._id), role: 'admin', authed: true }, async () => {
    await seedBusinessData({ companyId: company._id, bdm, bdm2, asm, rsm });
  });

  console.log('\n=== Seed summary ===');
  console.log('Created:', stats.created);
  console.log('Already existed:', stats.existing);
  console.log(`\nCompany slug for login: "${DEV_COMPANY_SLUG}"`);
  console.log(`Dev password for all accounts: "${DEV_PASSWORD}"`);
  console.log('Accounts: admin@dev.test, nsm@dev.test, zsm@dev.test, rsm@dev.test, asm@dev.test, bdm@dev.test, bdm2@dev.test');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
