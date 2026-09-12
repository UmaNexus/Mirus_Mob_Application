import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

const PaySlipLineItemSchema = new mongoose.Schema({
  label: { type: String, required: true },
  /** Full-month amount in paisa (before LOP proration). */
  fullAmount: { type: Number, default: 0 },
  /** Payable amount in paisa for the period (after LOP / statutory). */
  amount: { type: Number, required: true }
}, { _id: false });

const SalarySlipSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true, min: 2000 },

  metaSnapshot: {
    employeeDisplayId: { type: String, required: true },
    fullName: { type: String, required: true },
    designation: { type: String, required: true },
    department: { type: String, required: true },
    joiningDate: { type: String, default: '' },
    location: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountNo: { type: String, default: '' },
    bankAccountHidden: { type: String },
    pan: { type: String },
    pfNumber: { type: String, default: '' },
    uan: { type: String },
    effectiveWorkDays: { type: Number, default: null },
    lop: { type: Number, default: 0 }
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

SalarySlipSchema.index({ companyId: 1, employeeId: 1, month: 1, year: 1 }, { unique: true });

SalarySlipSchema.plugin(tenantScope);

export default mongoose.model('SalarySlip', SalarySlipSchema);
