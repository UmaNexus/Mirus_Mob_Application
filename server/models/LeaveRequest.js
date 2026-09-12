import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/** LeaveRequest (Epic 11) — an employee's leave application + approval trail. */
const LeaveRequestSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'], required: true },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  days: { type: Number, required: true, min: 0.5 },
  reason: { type: String, trim: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending', index: true },
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, trim: true }
}, { timestamps: true });

LeaveRequestSchema.plugin(tenantScope);

export default mongoose.model('LeaveRequest', LeaveRequestSchema);
