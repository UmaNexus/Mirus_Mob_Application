#!/usr/bin/env node
/**
 * Dedicated Google Play Reviewer & Demo Account Seeder.
 *
 * Idempotently provisions:
 * 1. BDM Field Force Representative:
 *    - Company: mirus
 *    - Email: reviewer.bdm@mirus.com
 *    - Employee ID: MMS-REV-001
 *    - Password: Reviewer@2026!
 *    - Role: Business development manager
 *
 * 2. ASM Field Force Manager:
 *    - Company: mirus
 *    - Email: reviewer.asm@mirus.com
 *    - Employee ID: MMS-REV-002
 *    - Password: Reviewer@2026!
 *    - Role: Area sales manager
 *
 * 3. Complete functional dataset for reviewer.bdm@mirus.com:
 *    - Assigned Doctors (Cardiology, Diabetology, Orthopedics, etc.)
 *    - Monthly Tour Plan (MTP)
 *    - Daily Call Reports (DCR)
 *    - Timestamped Attendance records
 *    - Expenses (Travel, Food, Stay)
 *    - Stockists & Secondary Sales
 *
 * Safe to re-run: every write is an upsert by stable key.
 *
 * Usage:
 *   node scripts/seed-reviewer-account.js
 *   npm run db:seed:reviewer
 */

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

const COMPANY_SLUG = process.env.REVIEWER_COMPANY_SLUG || 'dev';
const COMPANY_NAME = process.env.REVIEWER_COMPANY_NAME || 'Dev Field Force Co';
export const REVIEWER_PASSWORD = 'Reviewer@2026!';

const dateKey = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCHours(9, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};
const currentMonth = () => new Date().toISOString().slice(0, 7);

const address = {
  street: 'Plot 42, Healthcare Corridor, Road No. 12',
  city: 'Hyderabad',
  state: 'Telangana',
  country: 'India',
  zipCode: '500034'
};

async function getOrCreateCompany() {
  let company = await Company.findOne({ slug: COMPANY_SLUG });
  if (!company) {
    company = await Company.create({ slug: COMPANY_SLUG, name: COMPANY_NAME, status: 'active' });
    console.log(`✅ Created company "${COMPANY_NAME}" (${COMPANY_SLUG})`);
  }
  return company;
}

async function upsertUser(company, { email, role, firstName, lastName, gender, persona, employeeId, reportingManagerId }) {
  let user = await User.findOne({ companyId: company._id, email });
  const jobRole = persona ? await ensureJobRoleId(company._id, DEV_PERSONA_ROLE_NAMES[persona]) : null;

  if (user) {
    user.password = REVIEWER_PASSWORD;
    user.isActive = true;
    user.role = role;
    user.employeeDetails = user.employeeDetails || {};
    user.employeeDetails.reportingManagerId = reportingManagerId || null;
    user.employeeDetails.jobRole = jobRole;
    if (employeeId) user.employeeDetails.employeeId = employeeId;
    await user.save();
    console.log(`🔄 Updated reviewer account: ${email}`);
    return user;
  }

  user = await User.create({
    companyId: company._id,
    email,
    password: REVIEWER_PASSWORD,
    role,
    isActive: true,
    onboardingStage: 'completed',
    personalDetails: {
      firstName,
      lastName,
      dateOfBirth: new Date('1994-06-15'),
      gender: gender || 'Male'
    },
    contactInfo: {
      personalMobile: '9876543210',
      emergencyContactName: 'Office HR Desk',
      emergencyContactRelation: 'Other',
      emergencyContactPhone: '9876543211',
      presentAddress: address,
      permanentAddress: address
    },
    employeeDetails: {
      employeeId,
      department: 'Field Force',
      designation: persona === 'BDM' ? 'Business Development Manager' : 'Area Sales Manager',
      reportingManagerId: reportingManagerId || null,
      jobRole
    }
  });

  console.log(`✅ Created reviewer account: ${email}`);
  return user;
}

async function upsertDoc(Model, filter, createData) {
  let doc = await Model.findOne(filter);
  if (!doc) {
    doc = await Model.create(createData);
  }
  return doc;
}

export async function seedReviewerData() {
  const company = await getOrCreateCompany();

  // 1. Manager (ASM)
  const asm = await upsertUser(company, {
    email: 'reviewer.asm@dev.test',
    role: 'employee',
    firstName: 'Sam',
    lastName: 'Manager',
    gender: 'Female',
    persona: 'ASM',
    employeeId: 'DEV-REV-002'
  });

  // 2. Field Representative (BDM) - Primary Reviewer Persona
  const bdm = await upsertUser(company, {
    email: 'reviewer.bdm@dev.test',
    role: 'employee',
    firstName: 'Alex',
    lastName: 'Reviewer',
    gender: 'Male',
    persona: 'BDM',
    employeeId: 'DEV-REV-001',
    reportingManagerId: asm._id
  });

  await runWithStore({ companyId: String(company._id), role: 'admin', authed: true }, async () => {
    // 3. Assigned Doctors
    const doctorsList = [
      { name: 'Dr. Ananya Rao', speciality: 'Cardiology', area: 'Banjara Hills', phone: '9811122233' },
      { name: 'Dr. Vikram Sethi', speciality: 'Orthopedics', area: 'Jubilee Hills', phone: '9811122234' },
      { name: 'Dr. Priya Menon', speciality: 'Pediatrics', area: 'Madhapur', phone: '9811122235' },
      { name: 'Dr. Farhan Ahmed', speciality: 'General Medicine', area: 'Banjara Hills', phone: '9811122236' },
      { name: 'Dr. Sneha Kulkarni', speciality: 'Dermatology', area: 'Jubilee Hills', phone: '9811122237' },
      { name: 'Dr. Kiran Shah', speciality: 'Diabetology', area: 'Banjara Hills', phone: '9811122238' }
    ];

    const doctors = [];
    for (const doc of doctorsList) {
      const d = await upsertDoc(Doctor, { companyId: company._id, name: doc.name, assignedTo: bdm._id }, {
        companyId: company._id,
        name: doc.name,
        speciality: doc.speciality,
        area: doc.area,
        phone: doc.phone,
        assignedTo: bdm._id,
        createdBy: asm._id
      });
      doctors.push(d);
    }

    // 4. Past 7 days attendance history
    for (let i = 6; i >= 1; i--) {
      const d = daysAgo(i);
      const key = dateKey(d);
      const punchInAt = new Date(d);
      punchInAt.setUTCHours(9, 15, 0, 0);
      const punchOutAt = new Date(d);
      punchOutAt.setUTCHours(18, 0, 0, 0);

      await upsertDoc(Attendance, { companyId: company._id, userId: bdm._id, dateKey: key }, {
        companyId: company._id,
        userId: bdm._id,
        dateKey: key,
        date: d,
        status: i === 4 ? 'Half-Day' : 'Present',
        checkIn: '09:15',
        checkOut: '18:00',
        punchInAt,
        punchOutAt,
        workedHours: i === 4 ? 4.5 : 8.75
      });
    }

    // 5. Monthly Tour Plan (MTP)
    const month = currentMonth();
    await upsertDoc(MonthlyTourPlan, { companyId: company._id, userId: bdm._id, month }, {
      companyId: company._id,
      userId: bdm._id,
      month,
      status: 'approved',
      approverId: asm._id,
      remarks: 'Primary field visit plan for Banjara Hills and Jubilee Hills hospital cluster.',
      submittedAt: daysAgo(10),
      decidedAt: daysAgo(8),
      decisionNote: 'Approved. Proceed with doctor visits.'
    });

    // 6. Daily Call Reports (DCR)
    for (let i = 1; i <= 3; i++) {
      const visitDate = daysAgo(i);
      const key = dateKey(visitDate);
      const doc = doctors[(i - 1) % doctors.length];

      await upsertDoc(DailyCallReport, { companyId: company._id, userId: bdm._id, dateKey: key, doctorId: doc._id }, {
        companyId: company._id,
        userId: bdm._id,
        dateKey: key,
        date: visitDate,
        type: 'individual',
        doctorId: doc._id,
        productsDetailed: ['Cardivax 5mg', 'Ostilex 10mg'],
        feedback: 'Dr. discussed new clinical study findings and agreed to prescribe for outpatient clinic.',
        visitTime: visitDate,
        submittedAt: visitDate
      });

      await upsertDoc(WorkType, { companyId: company._id, userId: bdm._id, dateKey: key }, {
        companyId: company._id,
        userId: bdm._id,
        dateKey: key,
        date: visitDate,
        type: 'individual',
        details: { doctorId: String(doc._id), area: doc.area }
      });
    }

    // 7. Expenses
    await upsertDoc(Expense, { companyId: company._id, userId: bdm._id, category: 'Travel', date: daysAgo(2) }, {
      companyId: company._id,
      userId: bdm._id,
      category: 'Travel',
      date: daysAgo(2),
      amount: 45000, // 450.00 INR
      from: 'HQ Office',
      to: 'Banjara Hills Clinic Cluster',
      modeOfTravel: 'Own vehicle',
      status: 'approved',
      approverId: asm._id,
      decidedAt: daysAgo(1),
      decisionNote: 'Approved travel allowance'
    });

    await upsertDoc(Expense, { companyId: company._id, userId: bdm._id, category: 'Food', date: daysAgo(1) }, {
      companyId: company._id,
      userId: bdm._id,
      category: 'Food',
      date: daysAgo(1),
      amount: 30000, // 300.00 INR
      status: 'pending'
    });

    // 8. Stockists & Secondary Sales
    const stockist = await upsertDoc(Stockist, { companyId: company._id, userId: bdm._id, name: 'Apollo Pharmacy Distributors' }, {
      companyId: company._id,
      userId: bdm._id,
      name: 'Apollo Pharmacy Distributors',
      area: 'Banjara Hills',
      lastOrderAmount: 4800000,
      lastOrderDate: daysAgo(4),
      status: 'Active'
    });

    await upsertDoc(SecondarySale, { companyId: company._id, userId: bdm._id, productName: 'Cardivax 5mg' }, {
      companyId: company._id,
      userId: bdm._id,
      stockistId: stockist._id,
      productName: 'Cardivax 5mg',
      batchNumber: 'CDX-2026-08',
      expiryDate: new Date('2027-08-31'),
      quantity: 50,
      value: 1250000
    });

    // 9. Leave Request
    await upsertDoc(LeaveRequest, { companyId: company._id, userId: bdm._id, type: 'Casual' }, {
      companyId: company._id,
      userId: bdm._id,
      type: 'Casual',
      fromDate: daysAgo(5),
      toDate: daysAgo(5),
      days: 1,
      reason: 'Family emergency',
      status: 'Approved',
      approverId: asm._id,
      decidedAt: daysAgo(4),
      decisionNote: 'Leave sanctioned'
    });
  });

  return { company, asm, bdm };
}

async function run() {
  await connectDB();
  console.log('Seeding Google Play Reviewer test accounts...');
  const { bdm, asm } = await seedReviewerData();

  console.log('\n======================================================');
  console.log('  GOOGLE PLAY REVIEWER CREDENTIALS READY');
  console.log('======================================================');
  console.log(`  Company Code (Slug): ${COMPANY_SLUG}`);
  console.log('------------------------------------------------------');
  console.log('  PRIMARY TEST USER (BDM - Field Force):');
  console.log(`    Username/Email:   ${bdm.email}`);
  console.log(`    Employee ID:      ${bdm.employeeDetails.employeeId}`);
  console.log(`    Password:         ${REVIEWER_PASSWORD}`);
  console.log('------------------------------------------------------');
  console.log('  SECONDARY TEST USER (ASM - Manager):');
  console.log(`    Username/Email:   ${asm.email}`);
  console.log(`    Employee ID:      ${asm.employeeDetails.employeeId}`);
  console.log(`    Password:         ${REVIEWER_PASSWORD}`);
  console.log('======================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

// Run standalone if executed directly
if (process.argv[1]?.endsWith('seed-reviewer-account.js')) {
  run().catch(async (err) => {
    console.error('❌ Failed to seed reviewer accounts:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}
