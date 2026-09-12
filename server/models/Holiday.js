import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/** Holiday (Epic 11) — a company holiday-calendar entry. */
const HolidaySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  dateKey: { type: String, required: true }, // 'YYYY-MM-DD'
  date: { type: Date, required: true },
  name: { type: String, required: true, trim: true },
  optional: { type: Boolean, default: false }
}, { timestamps: true });

HolidaySchema.index({ companyId: 1, dateKey: 1 }, { unique: true });
HolidaySchema.plugin(tenantScope);

export default mongoose.model('Holiday', HolidaySchema);
