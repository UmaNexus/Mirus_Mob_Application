import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus
/**
 * Doctor (mobile field-force, Domain 2) — a doctor/contact tracked for field
 * visits. `assignedTo` is a single BDM (decision: one primary BDM per doctor;
 * reassignment history is recorded via the existing Activity log rather than
 * a duplicate history array on this document).
 */
const DoctorSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true },
  speciality: { type: String, trim: true, default: '' },
  area: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  dob: { type: Date, default: null },
  anniversaryDate: { type: Date, default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

DoctorSchema.index({ companyId: 1, assignedTo: 1 });
DoctorSchema.index({ companyId: 1, name: 'text', speciality: 'text', area: 'text' });
DoctorSchema.plugin(tenantScope);

export default mongoose.model('Doctor', DoctorSchema);
