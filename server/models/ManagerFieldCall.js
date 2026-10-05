import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus
const SampleGivenSchema = new mongoose.Schema({
  product: { type: String, trim: true, required: true },
  quantity: { type: Number, default: 1, min: 0 }
}, { _id: false });

/**
 * ManagerFieldCall (mobile field-force, Domain 6) — a manager's OWN doctor/
 * chemist/hospital visit, kept separate from DailyCallReport per client
 * decision (a manager filling in for a BDM is a distinct, separately
 * reported event, not a BDM call).
 */
const ManagerFieldCallSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the manager
  tier: { type: String, trim: true }, // HISTORICAL snapshot on records logged before JobRoles; read-only, never written or enforced

  jobRoleName: { type: String, trim: true, default: null }, // JobRole.name snapshot at logging time
  area: { type: String, trim: true, default: '' },
  visitType: { type: String, enum: ['Doctor', 'Chemist', 'Hospital'], required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null }, // optional link to an existing doctor
  contactName: { type: String, trim: true, default: '' }, // for a contact not (yet) in the Doctor collection
  speciality: { type: String, trim: true, default: '' },
  productsDetailed: { type: [String], default: [] },
  samplesGiven: { type: [SampleGivenSchema], default: [] },
  reason: { type: String, enum: ['No BDM assigned', 'BDM on leave', 'BDM vacancy', 'Emergency visit'], required: true },
  feedback: { type: String, trim: true, default: '' },
  loggedAt: { type: Date, default: Date.now }
}, { timestamps: true });

ManagerFieldCallSchema.index({ companyId: 1, userId: 1, loggedAt: -1 });
ManagerFieldCallSchema.plugin(tenantScope);

export default mongoose.model('ManagerFieldCall', ManagerFieldCallSchema);
