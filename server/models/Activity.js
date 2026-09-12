import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * Activity — durable audit / recent-activity feed (tenant-scoped).
 * Written from key mutations; listed on the admin dashboard.
 */
const ActivitySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: { type: String, trim: true, default: '' },
  action: { type: String, required: true, trim: true, index: true },
  entityType: { type: String, trim: true, default: '' },
  entityId: { type: String, trim: true, default: '' },
  message: { type: String, required: true, trim: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

ActivitySchema.index({ companyId: 1, createdAt: -1 });
ActivitySchema.plugin(tenantScope);

export default mongoose.model('Activity', ActivitySchema);
