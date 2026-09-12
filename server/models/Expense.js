import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus
/**
 * Expense (mobile field-force, Domain 5) — a single TA/DA claim line item.
 * `amount` is stored as an integer in paisa (CLAUDE.md financial rule; see
 * utils/money.js) — the API converts to/from rupees at the request boundary.
 */
const ExpenseSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category: { type: String, enum: ['Travel', 'Food', 'Stay', 'Internet', 'Misc'], required: true },
  date: { type: Date, required: true },
  stationType: { type: String, enum: ['Metro', 'Non-Metro', null], default: null },
  from: { type: String, trim: true, default: '' },
  to: { type: String, trim: true, default: '' },
  modeOfTravel: { type: String, trim: true, default: '' },
  amount: { type: Number, required: true, min: 0 }, // paisa (integer)
  receiptFileUrl: { type: String, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, trim: true, default: '' }
}, { timestamps: true });

ExpenseSchema.index({ companyId: 1, userId: 1, date: 1 });
ExpenseSchema.plugin(tenantScope);

export default mongoose.model('Expense', ExpenseSchema);
