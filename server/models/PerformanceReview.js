import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/** PerformanceReview (Epic 12) — a periodic review with KPI/target rows. */
const KpiSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  target: { type: String, trim: true },
  achieved: { type: String, trim: true },
  weightage: { type: Number, default: 0 },
  score: { type: Number, min: 0, max: 5, default: 0 }
}, { _id: false });

const PerformanceReviewSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  period: { type: String, required: true, trim: true }, // e.g. 'Q1-2026', 'FY2026'
  kpis: [KpiSchema],
  overallRating: { type: Number, min: 0, max: 5, default: 0 },
  comments: { type: String, trim: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['Draft', 'Published'], default: 'Draft', index: true }
}, { timestamps: true });

PerformanceReviewSchema.plugin(tenantScope);

export default mongoose.model('PerformanceReview', PerformanceReviewSchema);
