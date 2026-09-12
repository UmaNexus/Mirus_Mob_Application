import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * JobRole — persistable job-title / designation catalog (tenant-scoped).
 * Distinct from auth roles (admin / hr / employee).
 */
const JobRoleSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

JobRoleSchema.index({ companyId: 1, name: 1 }, { unique: true });
JobRoleSchema.plugin(tenantScope);

/** Default roles seeded for each company under Setup → Roles. */
export const DEFAULT_JOB_ROLES = [
  'Business development manager',
  'Area development manager',
  'Zonal development manager',
  'Regional development manager',
  'Office head',
  'HR'
];

export default mongoose.model('JobRole', JobRoleSchema);
