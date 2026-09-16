import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus
const PlannedVisitSchema = new mongoose.Schema({
  area: { type: String, trim: true, default: '' },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  week: { type: Number, min: 1, max: 6, default: null },
  date: { type: Date, default: null }
}, { _id: false });

/**
 * MonthlyTourPlan (mobile field-force, Domain 4) — one document per *tour
 * submission*. A BDM may have several independent MonthlyTourPlan documents
 * within the same calendar month (e.g. an early-month tour to one area and a
 * later, separately-approved tour to another) — `month` is a query/reporting
 * dimension, not a uniqueness key (see the non-unique index below; it was
 * unique until the multi-tour-per-month requirement, see git history).
 * `approverId` is always server-computed from the submitter's own
 * `employeeDetails.reportingManagerId` at submission time (client decision:
 * strict reporting hierarchy, never a client-chosen approver).
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

// Non-unique: a BDM may submit multiple independent tour plans in the same
// month. Kept as a plain index for the common "my/team plans for this month"
// queries. The real dev/production database still carries the OLD unique
// index physically — see scripts/migrate-mtp-allow-multiple-per-month.js.
MonthlyTourPlanSchema.index({ companyId: 1, userId: 1, month: 1 });
MonthlyTourPlanSchema.plugin(tenantScope);

export default mongoose.model('MonthlyTourPlan', MonthlyTourPlanSchema);
