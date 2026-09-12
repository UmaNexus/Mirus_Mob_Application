# Production-Grade HRMS Database Mongoose Models

Save these schemas using modern ES Module imports under your backend server directory `/server/models/`.

## 1. User & Profile Master Schema (`/server/models/User.js`)
```javascript
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

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

const DocumentReferenceSchema = new mongoose.Schema({
  documentType: { type: String, required: true, enum: ['Aadhar', 'PAN', 'Passport', 'VoterID', 'DegreeCertificate', 'RelievingLetter', 'Payslip'] },
  documentNumber: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'hr', 'employee'], default: 'employee' },
  isActive: { type: Boolean, default: false, index: true },
  lastLogin: { type: Date },

  personalDetails: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Non-binary', 'Prefer not to say'], required: true },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'], default: 'Single' },
    profilePictureUrl: { type: String, default: null }
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

  employeeDetails: {
    employeeId: { type: String, unique: true, sparse: true, uppercase: true, trim: true, index: true },
    designation: { type: String, trim: true },
    department: { type: String, enum: ['Engineering', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations', 'Design'] },
    dateOfJoining: { type: Date },
    employmentType: { type: String, enum: ['Full-Time', 'Part-Time', 'Contract', 'Intern'], default: 'Full-Time' },
    reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    panNumber: { type: String, uppercase: true, trim: true },
    uanNumber: { type: String, trim: true },
    bankDetails: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      bankName: { type: String, trim: true },
      ifscCode: { type: String, uppercase: true, trim: true }
    }
  },

  uploadedDocuments: [DocumentReferenceSchema]
}, { timestamps: true });

UserSchema.index({ 'personalDetails.firstName': 'text', 'personalDetails.lastName': 'text', 'employeeDetails.employeeId': 'text' });

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
```

## 2. Salary Structure Template Schema (`/server/models/SalaryStructureTemplate.js`)
```javascript
import mongoose from 'mongoose';

const FormulaFieldSchema = new mongoose.Schema({
  key: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  calculationType: { type: String, enum: ['fixed', 'percentage_of_ctc', 'percentage_of_basic'], required: true },
  valueFactor: { type: Number, required: true, default: 0 }
}, { _id: false });

const SalaryStructureTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, trim: true },
  earningsStructure: [FormulaFieldSchema],
  deductionsStructure: [FormulaFieldSchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('SalaryStructureTemplate', SalaryStructureTemplateSchema);
```

## 3. Employee Package Breakdown Assignment (`/server/models/EmployeeSalaryAssignment.js`)
```javascript
import mongoose from 'mongoose';

const FinancialBreakdownItemSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  monthlyAmount: { type: Number, required: true }
}, { _id: false });

const EmployeeSalaryAssignmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructureTemplate', required: true },
  annualCTC: { type: Number, required: true },
  
  frozenMonthlyBreakdown: {
    earnings: [FinancialBreakdownItemSchema],
    deductions: [FinancialBreakdownItemSchema],
    grossEarnings: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    netTakeHome: { type: Number, required: true }
  }
}, { timestamps: true });

export default mongoose.model('EmployeeSalaryAssignment', EmployeeSalaryAssignmentSchema);
```

## 4. Offer Letter Schema (`/server/models/OfferLetter.js`)
```javascript
import mongoose from 'mongoose';

const OfferLetterSchema = new mongoose.Schema({
  candidateEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  fullName: { type: String, required: true, trim: true },
  position: { type: String, required: true, trim: true },
  department: { type: String, required: true },
  offerDate: { type: Date, required: true, default: Date.now },
  joiningDate: { type: Date, required: true },
  salaryAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeSalaryAssignment', required: true },
  status: { type: String, enum: ['sent', 'pending', 'accepted', 'declined'], default: 'sent', index: true },
  
  pdfFileUrl: { type: String, required: true },
  signedPdfFileUrl: { type: String, default: null },
  
  digitalSignature: {
    signatureBase64: { type: String, default: null },
    signedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
    verificationToken: { type: String, default: null }
  }
}, { timestamps: true });

export default mongoose.model('OfferLetter', OfferLetterSchema);
```

## 5. Salary Slip Schema (`/server/models/SalarySlip.js`)
```javascript
import mongoose from 'mongoose';

const PaySlipLineItemSchema = new mongoose.Schema({
  label: { type: String, required: true },
  amount: { type: Number, required: true }
}, { _id: false });

const SalarySlipSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true, min: 2000 },
  
  metaSnapshot: {
    employeeDisplayId: { type: String, required: true },
    fullName: { type: String, required: true },
    designation: { type: String, required: true },
    department: { type: String, required: true },
    pan: { type: String },
    uan: { type: String },
    bankAccountHidden: { type: String }
  },
  
  earningsLedger: [PaySlipLineItemSchema],
  deductionsLedger: [PaySlipLineItemSchema],
  
  financialSummary: {
    grossEarnings: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    netPay: { type: Number, required: true },
    netPayInWords: { type: String, required: true }
  },
  
  pdfUrl: { type: String, required: true },
  isEmailed: { type: Boolean, default: false },
  paymentStatus: { type: String, enum: ['Paid', 'Processing', 'On-Hold'], default: 'Paid' }
}, { timestamps: true });

SalarySlipSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model('SalarySlip', SalarySlipSchema);
```
