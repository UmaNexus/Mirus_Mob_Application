import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/** ExitRecord (Epic 14) — offboarding checklist for a departing employee. */
const AssetReturnItemSchema = new mongoose.Schema({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
  description: { type: String, trim: true },
  returned: { type: Boolean, default: false },
  note: { type: String, trim: true }
}, { _id: false });

const ExitRecordSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  resignationDate: { type: Date, required: true },
  lastWorkingDay: { type: Date, required: true },
  reason: { type: String, trim: true },
  status: { type: String, enum: ['Initiated', 'InProgress', 'Completed'], default: 'Initiated', index: true },

  exitInterview: {
    conductedAt: { type: Date, default: null },
    notes: { type: String, trim: true },
    conductedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  assetReturnChecklist: [AssetReturnItemSchema],
  fnfSettlement: {
    amount: { type: Number, default: 0 }, // paisa
    status: { type: String, enum: ['Pending', 'Settled'], default: 'Pending' },
    settledAt: { type: Date, default: null },
    notes: { type: String, trim: true }
  },
  fnfLetterUrl: { type: String, default: null },
  relievingLetterUrl: { type: String, default: null },
  experienceLetterUrl: { type: String, default: null }
}, { timestamps: true });

ExitRecordSchema.plugin(tenantScope);

export default mongoose.model('ExitRecord', ExitRecordSchema);
