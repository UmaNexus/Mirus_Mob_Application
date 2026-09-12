import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * SecondarySale (mobile field-force, Domain 9) — a product batch tracked at
 * a stockist for secondary-sales/expiry visibility. `value` is paisa
 * (integer) per the CLAUDE.md financial rule.
 */
const SecondarySaleSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // owning BDM
  stockistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stockist', default: null },
  productName: { type: String, required: true, trim: true },
  batchNumber: { type: String, trim: true, default: '' },
  expiryDate: { type: Date, default: null },
  quantity: { type: Number, default: 0, min: 0 },
  value: { type: Number, default: 0, min: 0 } // paisa
}, { timestamps: true });

SecondarySaleSchema.index({ companyId: 1, userId: 1 });
SecondarySaleSchema.plugin(tenantScope);

export default mongoose.model('SecondarySale', SecondarySaleSchema);
