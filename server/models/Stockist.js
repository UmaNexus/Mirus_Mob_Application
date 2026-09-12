import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * Stockist (mobile field-force, Domain 8) — a distributor/stockist tracked
 * by a BDM for secondary-sales visibility. `lastOrderAmount` is paisa
 * (integer) per the CLAUDE.md financial rule.
 */
const StockistSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // owning BDM
  name: { type: String, required: true, trim: true },
  area: { type: String, trim: true, default: '' },
  lastOrderAmount: { type: Number, default: 0, min: 0 }, // paisa
  lastOrderDate: { type: Date, default: null },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

StockistSchema.index({ companyId: 1, userId: 1 });
StockistSchema.plugin(tenantScope);

export default mongoose.model('Stockist', StockistSchema);
