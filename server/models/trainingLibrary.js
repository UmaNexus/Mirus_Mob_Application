import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * Training media library (Epic 18): HR uploads training videos organized into
 * sections/courses; employees browse by section, watch, and mark complete.
 */

const TrainingSectionSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });
TrainingSectionSchema.plugin(tenantScope);

const TrainingMediaSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingSection', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  videoFileUrl: { type: String, required: true }, // authorized range-streamed
  durationSec: { type: Number, default: 0 },
  order: { type: Number, default: 0 }
}, { timestamps: true });
TrainingMediaSchema.plugin(tenantScope);

const TrainingProgressSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingMedia', required: true, index: true },
  status: { type: String, enum: ['assigned', 'in-progress', 'completed'], default: 'assigned' },
  completedAt: { type: Date, default: null }
}, { timestamps: true });
TrainingProgressSchema.index({ companyId: 1, userId: 1, mediaId: 1 }, { unique: true });
TrainingProgressSchema.plugin(tenantScope);

export const TrainingSection = mongoose.model('TrainingSection', TrainingSectionSchema);
export const TrainingMedia = mongoose.model('TrainingMedia', TrainingMediaSchema);
export const TrainingProgress = mongoose.model('TrainingProgress', TrainingProgressSchema);
