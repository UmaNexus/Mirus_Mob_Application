import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import tenantScope from './plugins/tenantScope.js';
import { FIELD_TIERS } from '../config/fieldForce.js';

const AddressSchema = new mongoose.Schema({
  street: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  country: { type: String, required: true, default: 'India', trim: true },
  zipCode: { type: String, required: true, trim: true }
}, { _id: false });

const FamilyMemberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  relationship: { type: String, required: true, enum: ['Father', 'Mother', 'Spouse', 'Sibling', 'Child', 'Other'] },
  dateOfBirth: { type: Date },
  dependent: { type: Boolean, default: false },
  contactNumber: { type: String, trim: true }
}, { _id: false });

// Extended document taxonomy (Epic 8/9): identity, education, experience and
// statutory categories the client requires.
export const DOCUMENT_TYPES = [
  'Aadhar', 'PAN', 'Passport', 'VoterID', 'DrivingLicence', 'PassportPhoto',
  'SSCCertificate', 'HSCCertificate', 'DegreeCertificate', 'EducationCertificate',
  'PostGraduateCertificate', 'ProfessionalCertificate',
  'ExperienceCertificate', 'RelievingLetter', 'Payslip', 'Other',
  // Previous-employer intake (onboarding wizard)
  'PreviousOfferLetter', 'ServiceOrFnfLetter'
];

const DocumentReferenceSchema = new mongoose.Schema({
  documentType: { type: String, required: true, enum: DOCUMENT_TYPES },
  // User-provided label for the document (e.g. "B.Tech Degree Certificate").
  documentName: { type: String, trim: true },
  documentNumber: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
}, { _id: false });

// Epic 9 — one row per qualification (SSC/10th, HSC/12th, degree, PG, professional).
const EducationSchema = new mongoose.Schema({
  level: { type: String, required: true, enum: ['SSC', 'HSC', 'Diploma', 'Graduate', 'PostGraduate', 'Doctorate', 'Professional', 'Other'] },
  institution: { type: String, required: true, trim: true },
  boardOrUniversity: { type: String, trim: true },
  yearOfPassing: { type: Number, min: 1950, max: 2100 },
  gradeOrPercentage: { type: String, trim: true },
  documentFileUrl: { type: String, default: null } // link to the uploaded certificate
}, { _id: true });

// Epic 9 — prior employment record (+ previous-employer document intake).
const ExperienceSchema = new mongoose.Schema({
  employerName: { type: String, required: true, trim: true },
  designation: { type: String, trim: true },
  fromDate: { type: Date },
  toDate: { type: Date },
  lastDrawnCTC: { type: Number }, // annual, in paisa (integer) — consistent with payroll
  reasonForLeaving: { type: String, trim: true },
  offerLetterFileUrl: { type: String, default: null },
  payslipFileUrls: { type: [String], default: [] }, // expect 3 when applicable
  serviceOrFnfFileUrl: { type: String, default: null }, // service letter or FNF
  relievingDocFileUrl: { type: String, default: null },
  experienceDocFileUrl: { type: String, default: null }
}, { _id: true });

// Epic 9 — professional reference.
const ReferenceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  relationship: { type: String, trim: true },
  company: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true }
}, { _id: true });

const UserSchema = new mongoose.Schema({
  // Tenant owner (Epic T). Email is unique *within* a company, not globally.
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'admin', 'hr', 'employee'], default: 'employee' },
  isActive: { type: Boolean, default: false, index: true },
  lastLogin: { type: Date },

  // --- Extensions ---
  // Soft-delete marker (US 2.3). Non-null => excluded from directory listings.
  // Kept distinct from `isActive` so "deactivated" and "deleted" stay separate.
  deletedAt: { type: Date, default: null, index: true },

  // Onboarding progress tracker (Epic 6). Current wizard stage to complete.
  onboardingStage: {
    type: String,
    enum: ['personal', 'family', 'contact', 'experience', 'bank', 'completed'],
    default: 'personal'
  },

  // Fresher / no prior employment — skips previous-employer document requirements.
  previousEmployerNotApplicable: { type: Boolean, default: false },

  // Hashed, single-use credential-setup token issued after offer acceptance
  // (US 5.4). Raw token is emailed; only the hash is persisted.
  passwordSetup: {
    tokenHash: { type: String, default: null },
    expiresAt: { type: Date, default: null }
  },

  personalDetails: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Non-binary', 'Prefer not to say'], required: true },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'], default: 'Single' },
    profilePictureUrl: { type: String, default: null },
    // Formal passport-size photograph (distinct from the UI avatar) — Epic 8.
    passportPhotoUrl: { type: String, default: null }
  },

  contactInfo: {
    personalMobile: { type: String, required: true, trim: true },
    workMobile: { type: String, trim: true },
    emergencyContactName: { type: String, required: true, trim: true },
    emergencyContactRelation: { type: String, required: true, trim: true },
    emergencyContactPhone: { type: String, required: true, trim: true },
    presentAddress: { type: AddressSchema, required: true },
    permanentAddress: { type: AddressSchema, required: true }
  },

  familyDetails: [FamilyMemberSchema],

  // Structured education history (Epic 9) — replaces relying on a single generic
  // certificate upload. `level` distinguishes SSC/12th/degree/PG/professional.
  educationHistory: [EducationSchema],

  // Structured previous-employment history + references (Epic 9).
  experienceHistory: [ExperienceSchema],
  references: [ReferenceSchema],

  employeeDetails: {
    employeeId: { type: String, uppercase: true, trim: true },
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    dateOfJoining: { type: Date },
    // Epic 8: client requires Permanent/Probation alongside the existing values.
    employmentType: { type: String, enum: ['Full-Time', 'Part-Time', 'Permanent', 'Probation', 'Contract', 'Intern'], default: 'Full-Time' },
    workLocation: { type: String, trim: true }, // Epic 8
    reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Mobile field-force hierarchy (separate from `role`; see config/fieldForce.js).
    // Fully optional/additive — absent on every pre-existing employee document,
    // which is exactly "not a field-force user" and requires no migration.
    fieldForce: {
      tier: { type: String, enum: FIELD_TIERS, default: null },
      territory: { type: String, trim: true, default: null }
    },
    panNumber: { type: String, uppercase: true, trim: true },
    uanNumber: { type: String, trim: true },
    esiNumber: { type: String, trim: true }, // Epic 8 (statutory)
    professionalTaxNumber: { type: String, trim: true }, // Epic 8 (statutory)
    bankDetails: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      bankName: { type: String, trim: true },
      ifscCode: { type: String, uppercase: true, trim: true },
      upiId: { type: String, trim: true } // Epic 8 (optional)
    }
  },

  uploadedDocuments: [DocumentReferenceSchema]
}, { timestamps: true });

// Tenant-scoped uniqueness (Epic T): email + employee id are unique per company.
UserSchema.index({ companyId: 1, email: 1 }, { unique: true });
// Partial (not sparse): a compound sparse index still indexes docs where only
// employeeId is null (companyId is always present), causing false collisions.
// Enforce uniqueness only for docs that actually have an employee id.
UserSchema.index(
  { companyId: 1, 'employeeDetails.employeeId': 1 },
  { unique: true, partialFilterExpression: { 'employeeDetails.employeeId': { $type: 'string' } } }
);
UserSchema.index({ 'personalDetails.firstName': 'text', 'personalDetails.lastName': 'text', 'employeeDetails.employeeId': 'text' });

UserSchema.plugin(tenantScope);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcryptjs.genSalt(12);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcryptjs.compare(candidatePassword, this.password);
};

export default mongoose.model('User', UserSchema);
