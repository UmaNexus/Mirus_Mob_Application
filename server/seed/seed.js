import 'dotenv/config';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fileURLToPath } from 'node:url';
import connectDB from '../config/db.js';
import Company, { PLATFORM_SLUG } from '../models/Company.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_ASSETS_DIR = path.join(__dirname, 'assets');

/**
 * Copy a permanent seed asset from server/seed/assets into uploads directories,
 * ensuring it is present across both runtime container mounts and host data folders.
 */
const copySeedAssetToUploads = (sourceFilename, subDir, destFilename) => {
  const candidateSources = [
    path.join(SEED_ASSETS_DIR, sourceFilename),
    path.resolve(process.cwd(), sourceFilename),
    path.resolve(process.cwd(), '..', sourceFilename),
    path.resolve('uploads', subDir, sourceFilename),
    path.resolve(process.cwd(), 'data', 'uploads', subDir, sourceFilename),
    path.resolve(process.cwd(), '..', 'data', 'uploads', subDir, sourceFilename)
  ];
  const srcPath = candidateSources.find((p) => fs.existsSync(p));
  if (!srcPath) return null;

  const targetDirs = [
    path.resolve('uploads', subDir),
    path.resolve(process.cwd(), 'data', 'uploads', subDir),
    path.resolve(process.cwd(), '..', 'data', 'uploads', subDir)
  ];

  let written = false;
  for (const td of targetDirs) {
    try {
      fs.mkdirSync(td, { recursive: true });
      fs.copyFileSync(srcPath, path.join(td, destFilename));
      written = true;
    } catch {
      // ignore
    }
  }

  return written ? `uploads/${subDir}/${destFilename}` : null;
};
import User from '../models/User.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import OfferLetter from '../models/OfferLetter.js';
import SalarySlip from '../models/SalarySlip.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Holiday from '../models/Holiday.js';
import PerformanceReview from '../models/PerformanceReview.js';
import { Incentive, Appraisal, TrainingRecord } from '../models/performanceExtras.js';
import Asset from '../models/Asset.js';
import EmployeeDocument from '../models/EmployeeDocument.js';
import DocumentType from '../models/DocumentType.js';
import EmployeeDocumentRecord from '../models/EmployeeDocumentRecord.js';
import { TrainingSection, TrainingMedia } from '../models/trainingLibrary.js';
import ExitRecord from '../models/ExitRecord.js';
import CFTemplate from '../models/CFTemplate.js';
import LetterTemplate, { DEFAULT_LETTER_EMAIL } from '../models/LetterTemplate.js';
import { computeBreakdown } from '../utils/salaryEngine.js';
import { rupeesToPaisa } from '../utils/money.js';
import { paisaToWords } from '../utils/numberToWords.js';
import { generateToken } from '../utils/tokens.js';
import { runWithStore } from '../utils/tenantContext.js';
import { generatePayslipPdf, generateOfferLetterPdf, bakeSignatureOnOffer, generateCompanyDocPdf } from '../services/pdfService.js';
import { CF_TEMPLATE_DIR, cfTemplateRelPath } from '../middleware/uploadCFTemplate.js';
import { LETTER_TEMPLATE_DIR, letterTemplateRelPath } from '../middleware/uploadLetterTemplate.js';

/**
 * Comprehensive multi-tenant demo seed — loads EVERY module with coherent data
 * for one demo company: admin + HR + employees (with education/experience),
 * salary templates, frozen assignments, payslips, offers, attendance, leave,
 * holidays, performance reviews/incentives/appraisals/training, assets,
 * generated + uploadable documents, a training library, and an exit record.
 *
 * Run with: npm run db:seed   (DESTRUCTIVE — drops the whole database first)
 */

const DEMO_PASSWORD = 'Password1';
const SIGNATURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const addr = (over = {}) => ({ street: '123 Tech Lane', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001', ...over });
const baseContact = () => ({
  personalMobile: '9876543210',
  emergencyContactName: 'Emergency Kin',
  emergencyContactRelation: 'Sibling',
  emergencyContactPhone: '9876500000',
  presentAddress: addr(),
  permanentAddress: addr()
});
const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

const TEMPLATES = [
  {
    name: 'Engineering-V2',
    description: 'Standard engineering compensation structure',
    earningsStructure: [
      { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 },
      { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 50 },
      { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [
      { key: 'pf', label: 'Provident Fund', calculationType: 'percentage_of_basic', valueFactor: 12 },
      { key: 'pt', label: 'Professional Tax', calculationType: 'fixed', valueFactor: 20000 },
      { key: 'tds', label: 'TDS', calculationType: 'percentage_of_ctc', valueFactor: 5 }
    ]
  },
  {
    name: 'Sales-Standard',
    description: 'Standard sales compensation structure',
    earningsStructure: [
      { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 40 },
      { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 40 },
      { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
    ],
    deductionsStructure: [
      { key: 'pf', label: 'Provident Fund', calculationType: 'percentage_of_basic', valueFactor: 12 },
      { key: 'pt', label: 'Professional Tax', calculationType: 'fixed', valueFactor: 20000 }
    ]
  }
];

const createPayslip = async (user, assignment, month, year, company = null) => {
  const b = assignment.frozenMonthlyBreakdown;
  const bank = user.employeeDetails?.bankDetails || {};
  const join = user.employeeDetails?.dateOfJoining
    ? new Date(user.employeeDetails.dateOfJoining)
    : null;
  const joiningDate = join && !Number.isNaN(join.getTime())
    ? `${String(join.getDate()).padStart(2, '0')}-${String(join.getMonth() + 1).padStart(2, '0')}-${join.getFullYear()}`
    : '';
  const data = {
    employeeId: user._id, month, year,
    metaSnapshot: {
      employeeDisplayId: user.employeeDetails.employeeId,
      fullName: `${user.personalDetails.firstName} ${user.personalDetails.lastName}`,
      designation: user.employeeDetails.designation,
      department: user.employeeDetails.department,
      joiningDate,
      location: user.employeeDetails.workLocation || '',
      bankName: bank.bankName || '',
      bankAccountNo: bank.accountNumber || '',
      bankAccountHidden: `****${String(bank.accountNumber || '').slice(-4)}`,
      pan: user.employeeDetails.panNumber,
      pfNumber: '',
      uan: user.employeeDetails.uanNumber,
      effectiveWorkDays: 30,
      lop: 0
    },
    earningsLedger: b.earnings.map((e) => ({
      label: e.label,
      fullAmount: e.monthlyAmount,
      amount: e.monthlyAmount
    })),
    deductionsLedger: b.deductions.map((d) => ({
      label: d.label,
      fullAmount: d.monthlyAmount,
      amount: d.monthlyAmount
    })),
    financialSummary: {
      grossEarnings: b.grossEarnings, totalDeductions: b.totalDeductions,
      netPay: b.netTakeHome, netPayInWords: paisaToWords(b.netTakeHome)
    },
    paymentStatus: 'Paid'
  };
  data.pdfUrl = await generatePayslipPdf(data, company);
  return SalarySlip.create(data);
};

const run = async () => {
  await connectDB();
  console.log('🧹 Dropping database...');
  await mongoose.connection.dropDatabase();

  // --- Platform tenant + superadmin (not scoped) ---
  const platform = await Company.create({ slug: PLATFORM_SLUG, name: 'Platform', status: 'active' });
  await User.create({
    companyId: platform._id, email: 'super@platform.local', password: 'ChangeMe!123', role: 'superadmin', isActive: true,
    onboardingStage: 'completed',
    personalDetails: { firstName: 'Platform', lastName: 'Admin', dateOfBirth: new Date('1985-01-01'), gender: 'Prefer not to say' },
    contactInfo: baseContact()
  });

  // --- Demo company with statutory config + branding ---
  const logoRel = copySeedAssetToUploads('mirus-logo.jpg', 'company', 'mirus-logo.jpg');
  const stampRel = copySeedAssetToUploads('mirus-stamp.jpg', 'company', 'mirus-stamp.jpg');
  const signatureRel = copySeedAssetToUploads('mirus-signature.jpg', 'company', 'mirus-signature.jpg');

  const company = await Company.create({
    slug: 'mirus', name: 'Mirus Med Sciences', status: 'active', contactEmail: 'hr@mirus.com',
    branding: {
      authorizedSignatoryName: 'Priya Sharma',
      authorizedSignatoryDesignation: 'HR Manager',
      logoUrl: logoRel,
      stampUrl: stampRel,
      signatureUrl: signatureRel
    },
    statutory: { gstin: '29ABCDE1234F1Z5', cin: 'U12345KA2020PTC000001' },
    address: addr(),
    // Prefer company-stored SMTP (Company Settings). Optionally hydrate from
    // env on first seed so local demo mail works without a manual UI step.
    mail: {
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: Number(process.env.SMTP_PORT) || 465,
      smtpUser: process.env.SMTP_USER || '',
      smtpPass: process.env.SMTP_PASS || '',
      mailFrom: process.env.MAIL_FROM || 'Mirus Med Sciences <hr@mirus.com>'
    },
    mailAccounts: [{
      label: 'Primary',
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: Number(process.env.SMTP_PORT) || 465,
      smtpUser: process.env.SMTP_USER || '',
      smtpPass: process.env.SMTP_PASS || '',
      mailFrom: process.env.MAIL_FROM || 'Mirus Med Sciences <hr@mirus.com>',
      isDefault: true,
      active: true
    }]
  });

  // Everything below runs inside the demo company's tenant context so companyId
  // is stamped automatically by the tenantScope plugin.
  const summary = await runWithStore({ companyId: String(company._id), role: 'admin', authed: true }, () => seedCompany(company));

  console.log('\n========================================================');
  console.log('  MIRUS MULTI-TENANT DEMO DATA LOADED');
  console.log('========================================================');
  Object.entries(summary).filter(([k]) => !k.startsWith('_')).forEach(([k, v]) => console.log(`  ${k.padEnd(14)}${v}`));
  console.log('--------------------------------------------------------');
  console.log('  LOGIN (company code / email / password)');
  console.log('   Company code (slug):  mirus');
  console.log('   Admin:      mirus / admin@mirus.com / Admin@123');
  console.log(`   HR:         mirus / priya.hr@mirus.com / ${DEMO_PASSWORD}`);
  console.log(`   Employee:   mirus / rahul.kumar@mirus.com / ${DEMO_PASSWORD}`);
  console.log(`   Employee:   mirus / freelancer.nenu@gmail.com / ${DEMO_PASSWORD}`);
  console.log('   Superadmin: _platform / super@platform.local / ChangeMe!123');
  if (summary._offerLink) {
    console.log('--------------------------------------------------------');
    console.log(`  LIVE OFFER LINK: /offer/${summary._offerLink}`);
  }
  console.log('========================================================\n');

  await mongoose.disconnect();
  process.exit(0);
};

async function seedCompany(company) {
  // --- Templates ---
  const [engTpl, salesTpl] = await SalaryStructureTemplate.create(TEMPLATES);

  // --- Admin + HR ---
  await User.create({
    email: 'admin@mirus.com', password: 'Admin@123', role: 'admin', isActive: true, onboardingStage: 'completed',
    personalDetails: { firstName: 'Admin', lastName: 'System', dateOfBirth: new Date('1988-01-01'), gender: 'Prefer not to say' },
    contactInfo: baseContact()
  });
  await User.create({
    email: 'priya.hr@mirus.com', password: DEMO_PASSWORD, role: 'hr', isActive: true, onboardingStage: 'completed',
    personalDetails: { firstName: 'Priya', lastName: 'Sharma', dateOfBirth: new Date('1990-06-15'), gender: 'Female' },
    contactInfo: baseContact(),
    employeeDetails: { employeeId: 'MMS45871', designation: 'HR Manager', department: 'HR', dateOfJoining: new Date('2021-04-01') }
  });

  // --- Employees ---
  const employeesSpec = [
    { email: 'rahul.kumar@mirus.com', first: 'Rahul', last: 'Kumar', empId: 'MMS45872', designation: 'Senior Software Engineer', department: 'Engineering', ctc: 1200000, tpl: engTpl, type: 'Permanent', manager: true, gender: 'Male' },
    { email: 'amit.patel@mirus.com', first: 'Amit', last: 'Patel', empId: 'MMS45873', designation: 'Software Engineer', department: 'Engineering', ctc: 900000, tpl: engTpl, type: 'Probation', gender: 'Male' },
    { email: 'neha.gupta@mirus.com', first: 'Neha', last: 'Gupta', empId: 'MMS45874', designation: 'Account Executive', department: 'Sales', ctc: 800000, tpl: salesTpl, type: 'Permanent', gender: 'Female' },
    { email: 'sunny.deol@mirus.com', first: 'Sunny', last: 'Deol', empId: 'MMS45860', designation: 'Operations Lead', department: 'Operations', ctc: 1500000, tpl: engTpl, type: 'Contract', exiting: true, gender: 'Male' },
    { email: 'freelancer.nenu@gmail.com', first: 'Ananya', last: 'Sharma', empId: 'MMS45875', designation: 'Frontend Engineer', department: 'Engineering', ctc: 1000000, tpl: engTpl, type: 'Permanent', gender: 'Female' }
  ];

  const employees = [];
  let managerId = null;
  for (const spec of employeesSpec) {
    const user = await User.create({
      email: spec.email, password: DEMO_PASSWORD, role: 'employee', isActive: true, onboardingStage: 'completed',
      personalDetails: { firstName: spec.first, lastName: spec.last, dateOfBirth: new Date('1993-09-20'), gender: spec.gender || 'Male', maritalStatus: 'Single', passportPhotoUrl: null },
      contactInfo: baseContact(),
      familyDetails: [{ name: `${spec.first} Sr.`, relationship: 'Father', dependent: true }],
      educationHistory: [
        { level: 'HSC', institution: 'City Junior College', boardOrUniversity: 'State Board', yearOfPassing: 2010, gradeOrPercentage: '88%' },
        { level: 'Graduate', institution: 'National Institute of Technology', boardOrUniversity: 'NIT', yearOfPassing: 2014, gradeOrPercentage: '8.2 CGPA' }
      ],
      experienceHistory: [
        { employerName: 'Prior Tech Pvt Ltd', designation: 'Engineer', fromDate: new Date('2015-06-01'), toDate: new Date('2022-06-30'), lastDrawnCTC: rupeesToPaisa(900000), reasonForLeaving: 'Career growth' }
      ],
      references: [{ name: 'Former Manager', relationship: 'Manager', company: 'Prior Tech', phone: '9800000000' }],
      employeeDetails: {
        employeeId: spec.empId, designation: spec.designation, department: spec.department,
        employmentType: spec.type, workLocation: 'Hyderabad HQ',
        dateOfJoining: new Date('2022-07-01'), panNumber: 'ABCDE1234F', uanNumber: '100200300400',
        esiNumber: 'ESI-EMP-001', professionalTaxNumber: 'PT-EMP-001',
        reportingManagerId: managerId,
        bankDetails: { accountHolderName: `${spec.first} ${spec.last}`, accountNumber: '123456789012', bankName: 'HDFC Bank', ifscCode: 'HDFC0001234', upiId: `${spec.first.toLowerCase()}@hdfc` }
      }
    });
    if (spec.manager) managerId = user._id;

    const breakdown = computeBreakdown(spec.tpl, rupeesToPaisa(spec.ctc));
    const assignment = await EmployeeSalaryAssignment.create({ userId: user._id, templateId: spec.tpl._id, annualCTC: rupeesToPaisa(spec.ctc), frozenMonthlyBreakdown: breakdown });
    await createPayslip(user, assignment, 5, 2026, company);
    await createPayslip(user, assignment, 6, 2026, company);

    employees.push({ user, assignment, spec });
  }

  await seedModules(company, employees);
  await seedCFTemplates();
  await seedLetterTemplates();

  // --- Offers: one sent (live link) + one accepted ---
  const link = await seedOffers(engTpl, company);

  return {
    Users: await User.countDocuments(),
    Templates: await SalaryStructureTemplate.countDocuments(),
    Assignments: await EmployeeSalaryAssignment.countDocuments(),
    Payslips: await SalarySlip.countDocuments(),
    Offers: await OfferLetter.countDocuments(),
    Attendance: await Attendance.countDocuments(),
    Leaves: await LeaveRequest.countDocuments(),
    Holidays: await Holiday.countDocuments(),
    Reviews: await PerformanceReview.countDocuments(),
    Assets: await Asset.countDocuments(),
    'Docs (issued)': await EmployeeDocument.countDocuments(),
    'Doc types': await DocumentType.countDocuments(),
    'Training sec.': await TrainingSection.countDocuments(),
    Exits: await ExitRecord.countDocuments(),
    'C&F templates': await CFTemplate.countDocuments(),
    _offerLink: link
  };
}

async function seedModules(company, employees) {
  const rahul = employees[0].user;

  // Vault documents on the first employee.
  rahul.uploadedDocuments.push(
    { documentType: 'PAN', documentNumber: 'ABCDE1234F', fileUrl: 'uploads/documents/seed-pan.pdf', verificationStatus: 'Verified' },
    { documentType: 'Aadhar', documentNumber: '111122223333', fileUrl: 'uploads/documents/seed-aadhar.pdf', verificationStatus: 'Pending' },
    { documentType: 'DrivingLicence', documentNumber: 'KA0120200001', fileUrl: 'uploads/documents/seed-dl.pdf', verificationStatus: 'Verified' }
  );
  await rahul.save();

  // Attendance — last 10 days for each employee (one Absent for variety).
  for (const { user } of employees) {
    for (let i = 1; i <= 10; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      await Attendance.create({ userId: user._id, date: d, dateKey: dateKey(d), status: i === 3 ? 'Absent' : 'Present', checkIn: '09:30', checkOut: '18:30' });
    }
  }

  // Leave — one pending, one approved.
  await LeaveRequest.create({ userId: rahul._id, type: 'Casual', fromDate: new Date('2026-07-20'), toDate: new Date('2026-07-21'), days: 2, reason: 'Personal work', status: 'Pending' });
  await LeaveRequest.create({ userId: employees[1].user._id, type: 'Sick', fromDate: new Date('2026-06-10'), toDate: new Date('2026-06-11'), days: 2, reason: 'Fever', status: 'Approved', decidedAt: new Date() });

  // Holidays.
  await Holiday.create({ date: new Date('2026-08-15'), dateKey: '2026-08-15', name: 'Independence Day' });
  await Holiday.create({ date: new Date('2026-10-02'), dateKey: '2026-10-02', name: 'Gandhi Jayanti' });

  // Performance: review + incentive + appraisal + training record for Rahul.
  await PerformanceReview.create({
    userId: rahul._id, period: 'Q1-2026', overallRating: 4, status: 'Published', comments: 'Strong quarter, exceeded delivery targets.',
    kpis: [{ title: 'On-time delivery', target: '95%', achieved: '98%', weightage: 40, score: 5 }, { title: 'Code quality', target: 'A', achieved: 'A', weightage: 30, score: 4 }]
  });
  await Incentive.create({ userId: rahul._id, period: 'Q1-2026', amount: rupeesToPaisa(25000), reason: 'Delivery bonus', status: 'Approved' });
  await Appraisal.create({ userId: rahul._id, effectiveDate: new Date('2026-04-01'), previousDesignation: 'Software Engineer', newDesignation: 'Senior Software Engineer', previousCTC: rupeesToPaisa(1000000), newCTC: rupeesToPaisa(1200000), remarks: 'Promotion on merit' });
  await TrainingRecord.create({ userId: rahul._id, title: 'Advanced React', provider: 'Internal L&D', completedAt: new Date('2026-05-15'), status: 'Completed' });

  // Assets — assign a laptop + mobile; one spare available.
  await Asset.create({ tag: 'LAP-001', type: 'Laptop', description: 'Dell Latitude 7420', serialNumber: 'DL7420-001', status: 'Assigned', assignedTo: rahul._id, issuedAt: new Date('2022-07-01') });
  await Asset.create({ tag: 'MOB-014', type: 'Mobile', description: 'iPhone SE', status: 'Assigned', assignedTo: employees[2].user._id, issuedAt: new Date('2023-01-10') });
  await Asset.create({ tag: 'LAP-002', type: 'Laptop', description: 'MacBook Air M2', status: 'Available' });

  // Generated + sealed document (acknowledged handbook) for Rahul.
  const pdfUrl = await generateCompanyDocPdf({
    title: 'Employee Handbook Acknowledgment', company,
    employeeName: 'Rahul Kumar', designation: 'Senior Software Engineer', effectiveDate: new Date('2022-07-01'),
    paragraphs: ['I acknowledge that I have received and read the employee handbook of Mirus Med Sciences.', 'I agree to comply with the company policies.']
  });
  await EmployeeDocument.create({ userId: rahul._id, type: 'Handbook', title: 'Employee Handbook Acknowledgment', pdfFileUrl: pdfUrl, requiresSignature: false, status: 'acknowledged', acknowledgedAt: new Date() });

  // Uploadable document type (Form 16, read) + a pending record for Rahul.
  const form16 = await DocumentType.create({ name: 'Form 16', section: 'Tax', kind: 'read', termsText: 'Please confirm you have received your Form 16.' });
  await DocumentType.create({ name: 'Investment Declaration', section: 'Tax', kind: 'write', fields: [{ key: 'section80C', label: '80C investments (₹)', type: 'number', required: true }, { key: 'hraClaim', label: 'HRA claim (₹)', type: 'number' }] });
  await EmployeeDocumentRecord.create({
    userId: rahul._id,
    documentTypeId: form16._id,
    description: 'Form 16 (sample)',
    section: 'Tax',
    accessMode: 'read',
    sourceFileUrl: 'uploads/documents/seed-form16.pdf',
    status: 'pending'
  });

  // Training library — sections (videos uploaded later by HR).
  await TrainingSection.create({ title: 'Onboarding', description: 'New-joiner orientation', order: 1 });
  await TrainingSection.create({ title: 'Compliance', description: 'POSH & security awareness', order: 2 });

  // Exit record for the departing employee.
  const exiting = employees.find((e) => e.spec.exiting);
  if (exiting) {
    await ExitRecord.create({
      userId: exiting.user._id, resignationDate: new Date('2026-06-15'), lastWorkingDay: new Date('2026-07-15'),
      reason: 'Relocation', status: 'InProgress',
      exitInterview: { conductedAt: new Date('2026-07-10'), notes: 'Positive experience overall.' },
      fnfSettlement: { amount: rupeesToPaisa(75000), status: 'Pending' },
      assetReturnChecklist: [{ description: 'Laptop', returned: false }]
    });
  }
}

async function seedOffers(engTpl, company = null) {
  let liveLink = null;
  const offerSpecs = [
    { email: 'vikram.singh@example.com', name: 'Vikram Singh', position: 'UI/UX Designer', department: 'Design', ctc: 1000000, accept: false },
    { email: 'rajesh.k@example.com', name: 'Rajesh Kumar', position: 'DevOps Specialist', department: 'Engineering', ctc: 1400000, accept: true }
  ];
  for (const o of offerSpecs) {
    const cand = await User.create({
      email: o.email, password: generateToken().raw, role: 'employee', isActive: false, onboardingStage: 'personal',
      personalDetails: { firstName: o.name.split(' ')[0], lastName: o.name.split(' ').slice(1).join(' ') || '-', dateOfBirth: new Date('1970-01-01'), gender: 'Prefer not to say' },
      contactInfo: { ...baseContact(), personalMobile: '0000000000', emergencyContactName: 'Pending', emergencyContactRelation: 'Pending', emergencyContactPhone: '0000000000', presentAddress: addr({ street: 'Pending', city: 'Pending', state: 'Pending', zipCode: '000000' }), permanentAddress: addr({ street: 'Pending', city: 'Pending', state: 'Pending', zipCode: '000000' }) }
    });
    const breakdown = computeBreakdown(engTpl, rupeesToPaisa(o.ctc));
    const assignment = await EmployeeSalaryAssignment.create({ userId: cand._id, templateId: engTpl._id, annualCTC: rupeesToPaisa(o.ctc), frozenMonthlyBreakdown: breakdown });
    const { pdfFileUrl, acceptancePlacement } = await generateOfferLetterPdf({
      fullName: o.name, position: o.position, department: o.department, offerDate: new Date(),
      joiningDate: new Date('2026-08-01'), breakdown, annualCTC: rupeesToPaisa(o.ctc), company
    });
    const { raw, hash } = generateToken();
    const offer = await OfferLetter.create({
      candidateEmail: o.email, fullName: o.name, position: o.position, department: o.department,
      offerDate: new Date(), joiningDate: new Date('2026-08-01'), salaryAssignmentId: assignment._id,
      status: o.accept ? 'accepted' : 'sent', pdfFileUrl, acceptancePlacement,
      accessTokenHash: o.accept ? null : hash, accessTokenExpires: o.accept ? null : new Date(Date.now() + 7 * 864e5)
    });
    if (o.accept) {
      const signedAt = new Date();
      offer.signedPdfFileUrl = await bakeSignatureOnOffer(pdfFileUrl, SIGNATURE_PNG, {
        name: o.name, signedAt, acceptancePlacement
      });
      offer.digitalSignature = { signatureBase64: SIGNATURE_PNG, signedAt, ipAddress: '127.0.0.1', verificationToken: generateToken().hash };
      offer.acceptedAt = signedAt;
      await offer.save();
    } else {
      liveLink = raw;
    }
  }
  return liveLink;
}

/**
 * Seed C&F agreement template:
 * - Agent from seed/cf-examples/cf-agent.pdf (C&F new)
 */
async function seedCFTemplates() {
  fs.mkdirSync(CF_TEMPLATE_DIR, { recursive: true });
  const examplesDir = path.resolve('seed', 'cf-examples');

  const installExample = async ({ type, name, description, sourceName, originalFileName }) => {
    const src = path.join(examplesDir, sourceName);
    if (!fs.existsSync(src)) {
      console.warn(`⚠️  Missing C&F example ${sourceName} — skipping ${name}`);
      return;
    }
    const filename = `${crypto.randomUUID()}.pdf`;
    await fsp.copyFile(src, path.join(CF_TEMPLATE_DIR, filename));
    await CFTemplate.create({
      type,
      name,
      description,
      fileUrl: cfTemplateRelPath(filename),
      originalFileName,
      mimeType: 'application/pdf',
      active: true
    });
  };

  await installExample({
    type: 'CFAgent',
    name: 'C&F Agency Agreement',
    description: 'Standard C&F Agency appointment agreement (from C&F new).',
    sourceName: 'cf-agent.pdf',
    originalFileName: 'C&F Agency Agreement.pdf'
  });
}

async function seedLetterTemplates() {
  fs.mkdirSync(LETTER_TEMPLATE_DIR, { recursive: true });

  const defaults = [
    {
      type: 'OfferLetter',
      name: 'Default Offer Letter',
      title: 'Offer of Employment',
      bodyParagraphs: [
        'We are pleased to extend this Offer of Employment for the position of {{designation}} in our organization, based at {{companyLocation}}.',
        'We were impressed with your profile, experience, and the interview discussions. We believe your skills and enthusiasm will be a valuable addition to our {{department}} team. As a {{designation}}, you will play a key role in promoting our products, building strong relationships with healthcare professionals, and contributing to the achievement of sales targets in your assigned territory. This position offers good growth opportunities within the organization for high performers.'
      ],
      emailSubject: DEFAULT_LETTER_EMAIL.OfferLetter.subject,
      emailBody: DEFAULT_LETTER_EMAIL.OfferLetter.body
    },
    {
      type: 'AppointmentLetter',
      name: 'Default Appointment Letter',
      title: 'APPOINTMENT LETTER',
      // Display/email + PDF body — generation prefers these paragraphs (or AcroForm PDF).
      bodyParagraphs: [
        'Dear {{employeeName}},',
        'We are pleased to confirm your appointment as {{designation}} with effect from {{joiningDate}}.',
        'Your assigned reporting area will be: {{Location}}',
        'Date of Joining & Initial Training:',
        'You are expected to join on {{joiningDate}}. Please carry all necessary documents (educational certificates, ID proofs, previous experience letters, etc.) on the day of joining.'
      ],
      emailSubject: DEFAULT_LETTER_EMAIL.AppointmentLetter.subject,
      emailBody: DEFAULT_LETTER_EMAIL.AppointmentLetter.body
    },
    {
      type: 'ServiceLetter',
      name: 'Default Service Letter',
      title: 'Service Certificate',
      bodyParagraphs: [
        'This is to certify that {{employeeName}} ({{employeeId}}) has been employed with {{companyName}} as {{designation}}.',
        'Date of joining: {{joiningDate}}.'
      ],
      emailSubject: DEFAULT_LETTER_EMAIL.ServiceLetter.subject,
      emailBody: DEFAULT_LETTER_EMAIL.ServiceLetter.body
    },
    {
      type: 'FNFLetter',
      name: 'Default FNF Letter',
      title: 'Full & Final Settlement',
      bodyParagraphs: [
        'Dear {{employeeName}},',
        'Your full and final settlement with {{companyName}} is enclosed. Last working day: {{lastWorkingDay}}.'
      ],
      emailSubject: DEFAULT_LETTER_EMAIL.FNFLetter.subject,
      emailBody: DEFAULT_LETTER_EMAIL.FNFLetter.body
    }
  ];

  for (const d of defaults) {
    let fileUrl = null;
    let originalFileName = `${d.name}.pdf`;

    if (d.type === 'FNFLetter') {
      const fnfRel = copySeedAssetToUploads('FNF_Settlement_Letter_Template.pdf', 'letter-templates/FNFLetter', 'FNF_Settlement_Letter_Template.pdf');
      if (fnfRel) {
        fileUrl = fnfRel;
        originalFileName = 'FNF_Settlement_Letter_Template.pdf';
      }
    }

    if (!fileUrl) {
      // Minimal blank PDF so View works out of the box; replace with branded letterhead anytime.
      const doc = await PDFDocument.create();
      const page = doc.addPage([595, 842]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      page.drawText('Mirus Med Sciences', { x: 48, y: 780, size: 16, font: bold });
      page.drawText(d.title, { x: 48, y: 750, size: 12, font: bold });
      page.drawText('Upload a fillable letterhead PDF to replace this sample.', { x: 48, y: 720, size: 10, font });
      const bytes = await doc.save();
      const typeDir = path.resolve(LETTER_TEMPLATE_DIR, d.type);
      await fsp.mkdir(typeDir, { recursive: true });
      const filename = `${d.type}-${d.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'template'}-${crypto.randomUUID()}.pdf`;
      await fsp.writeFile(path.join(typeDir, filename), bytes);
      fileUrl = letterTemplateRelPath(d.type, filename);
    }

    await LetterTemplate.create({
      ...d,
      fileUrl,
      originalFileName,
      mimeType: 'application/pdf',
      isDefault: true,
      active: true
    });
  }
}


run().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
