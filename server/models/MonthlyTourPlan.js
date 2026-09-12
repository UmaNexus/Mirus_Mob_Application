import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus
const PlannedVisitSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  week: { type: Number, min: 1, max: 6, default: null },
  date: { type: Date, default: null }
}, { _id: false });

/**
 * MonthlyTourPlan (mobile field-force, Domain 4) — one document per BDM per
 * calendar month. `approverId` is always server-computed from the submitter's
 * own `employeeDetails.reportingManagerId` at submission time (client
 * decision: strict reporting hierarchy, never a client-chosen approver).
 */
const MonthlyTourPlanSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the BDM
  month: { type: String, required: true }, // 'YYYY-MM'
  plannedVisits: { type: [PlannedVisitSchema], default: [] },
  status: { type: String, enum: ['draft', 'pending', 'approved', 'rejected', 'withdrawn'], default: 'draft', index: true },
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  remarks: { type: String, trim: true, default: '' },
  submittedAt: { type: Date, default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, trim: true, default: '' }
}, { timestamps: true });

MonthlyTourPlanSchema.index({ companyId: 1, userId: 1, month: 1 }, { unique: true });
MonthlyTourPlanSchema.plugin(tenantScope);

export default mongoose.model('MonthlyTourPlan', MonthlyTourPlanSchema);
