import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus 
/**
 * WorkType (mobile field-force, Domain 7) — one "what am I doing today"
 * marker per field-force user per day. `sick`/`leave` selections never store
 * leave data here directly — they create/link the existing LeaveRequest
 * (client decision: reuse the existing Leave module, do not duplicate it).
 */
const WorkTypeSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dateKey: { type: String, required: true }, // 'YYYY-MM-DD'
  date: { type: Date, required: true },
  type: {
    type: String,
    enum: ['individual', 'joint', 'camp', 'meeting', 'sick', 'leave', 'fieldcall', 'jointcall'],
    required: true
  },
  // Loosely-typed, per-type descriptive fields (doctorId/product/area for
  // individual+joint; campName/venue for camp; agenda/location for meeting;
  // accompaniedBy for joint/jointcall — validated against the reporting
  // chain, same as DCR joint calls). Never the source of truth for leave.
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  linkedLeaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', default: null }
}, { timestamps: true });

WorkTypeSchema.index({ companyId: 1, userId: 1, dateKey: 1 }, { unique: true });
WorkTypeSchema.plugin(tenantScope);

export default mongoose.model('WorkType', WorkTypeSchema);
