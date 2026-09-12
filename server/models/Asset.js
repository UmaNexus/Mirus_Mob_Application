import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/** Asset (Epic 13) — company asset register (laptop, mobile, promo material…). */
const AssetSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  tag: { type: String, required: true, trim: true }, // asset tag / inventory code
  type: { type: String, enum: ['Laptop', 'Mobile', 'Monitor', 'AccessCard', 'Promotional', 'Other'], default: 'Other' },
  description: { type: String, trim: true },
  serialNumber: { type: String, trim: true },
  status: { type: String, enum: ['Available', 'Assigned', 'Returned', 'Retired'], default: 'Available', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  issuedAt: { type: Date, default: null },
  returnedAt: { type: Date, default: null },
  condition: { type: String, trim: true }
}, { timestamps: true });

AssetSchema.index({ companyId: 1, tag: 1 }, { unique: true });
AssetSchema.plugin(tenantScope);

export default mongoose.model('Asset', AssetSchema);
