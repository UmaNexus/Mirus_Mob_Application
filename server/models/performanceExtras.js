import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * Performance-adjacent records (Epic 12): incentives, appraisals/promotions and
 * training records. Grouped in one module; each is its own Mongoose model.
 */

const IncentiveSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  period: { type: String, required: true, trim: true },
  amount: { type: Number, required: true }, // paisa
  reason: { type: String, trim: true },
  status: { type: String, enum: ['Proposed', 'Approved', 'Paid'], default: 'Proposed', index: true },
  attachmentFileId: { type: String, default: null },
  attachmentFileName: { type: String, default: null }
}, { timestamps: true });
IncentiveSchema.plugin(tenantScope);

const AppraisalSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  effectiveDate: { type: Date, required: true },
  previousDesignation: { type: String, trim: true },
  newDesignation: { type: String, trim: true },
  previousCTC: { type: Number }, // paisa
  newCTC: { type: Number },      // paisa
  remarks: { type: String, trim: true },
  attachmentFileId: { type: String, default: null },
  attachmentFileName: { type: String, default: null }
}, { timestamps: true });
AppraisalSchema.plugin(tenantScope);

const TrainingRecordSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  provider: { type: String, trim: true },
  completedAt: { type: Date },
  status: { type: String, enum: ['Assigned', 'In-Progress', 'Completed'], default: 'Assigned', index: true },
  certificateFileUrl: { type: String, default: null }
}, { timestamps: true });
TrainingRecordSchema.plugin(tenantScope);

export const Incentive = mongoose.model('Incentive', IncentiveSchema);
export const Appraisal = mongoose.model('Appraisal', AppraisalSchema);
export const TrainingRecord = mongoose.model('TrainingRecord', TrainingRecordSchema);
