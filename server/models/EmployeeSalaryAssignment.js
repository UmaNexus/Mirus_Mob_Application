import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

const FinancialBreakdownItemSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  // Monthly amount in paisa (integer) to avoid floating-point drift.
  monthlyAmount: { type: Number, required: true }
}, { _id: false });

const EmployeeSalaryAssignmentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructureTemplate', required: true },
  // Annual CTC in paisa (integer).
  annualCTC: { type: Number, required: true },

  frozenMonthlyBreakdown: {
    earnings: [FinancialBreakdownItemSchema],
    deductions: [FinancialBreakdownItemSchema],
    grossEarnings: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    netTakeHome: { type: Number, required: true }
  }
}, { timestamps: true });

EmployeeSalaryAssignmentSchema.plugin(tenantScope);

export default mongoose.model('EmployeeSalaryAssignment', EmployeeSalaryAssignmentSchema);
