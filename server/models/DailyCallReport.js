import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus

const SampleGivenSchema = new mongoose.Schema({
  product: { type: String, trim: true, required: true },
  quantity: { type: Number, default: 1, min: 0 }
}, { _id: false });
/**
 * DailyCallReport (mobile field-force, Domain 3) — one row per doctor call
 * (individual, joint, or missed). A BDM's DCR "list" for a day is simply
 * every DailyCallReport document with that dateKey; there is no separate
 * day-level document.
 */
const DailyCallReportSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the BDM
  dateKey: { type: String, required: true }, // 'YYYY-MM-DD'
  date: { type: Date, required: true },
  type: { type: String, enum: ['individual', 'joint', 'missed'], required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  // Required only for type: 'joint' — validated server-side against the
  // submitter's own reporting chain (see fieldForceAuth.buildReportingChainAbove).
  accompaniedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  productsDetailed: { type: [String], default: [] },
  samplesGiven: { type: [SampleGivenSchema], default: [] },
  feedback: { type: String, trim: true, default: '' },
  visitTime: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

DailyCallReportSchema.index({ companyId: 1, userId: 1, dateKey: 1 });
DailyCallReportSchema.plugin(tenantScope);

export default mongoose.model('DailyCallReport', DailyCallReportSchema);
