import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * Department — persistable department catalog (tenant-scoped).
 * Stored on users/offers as the name string (same pattern as JobRole).
 */
const DepartmentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

DepartmentSchema.index({ companyId: 1, name: 1 }, { unique: true });
DepartmentSchema.plugin(tenantScope);

/** Default departments seeded under Setup → Departments (offer/user dropdowns). */
export const DEFAULT_DEPARTMENTS = [
  'Engineering',
  'HR',
  'Sales',
  'Marketing',
  'Finance',
  'Operations',
  'Design',
  'Accounts',
  'Office Staff'
];

export default mongoose.model('Department', DepartmentSchema);
