import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * CFTemplate — Clearing & Forwarding agreement templates per channel partner type.
 * Types: C&F Agent, C&F Distributor, C&F Wholesaler.
 * Each template stores a reference PDF (UUID under uploads/cf-templates/) used
 * as the company agreement form; placeholders in the PDF are filled manually
 * or by a future merge pipeline.
 */
export const CF_TEMPLATE_TYPES = ['CFAgent', 'CFDistributor', 'CFWholesaler'];

export const CF_TEMPLATE_TYPE_LABELS = {
  CFAgent: 'C&F Agent',
  CFDistributor: 'C&F Distributor',
  CFWholesaler: 'C&F Wholesaler'
};

const CFTemplateSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  type: { type: String, enum: CF_TEMPLATE_TYPES, required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  // Repo-relative path, e.g. uploads/cf-templates/<uuid>.pdf — never expose raw paths to clients.
  fileUrl: { type: String, default: null },
  originalFileName: { type: String, trim: true, default: null },
  mimeType: { type: String, trim: true, default: 'application/pdf' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

CFTemplateSchema.index({ companyId: 1, type: 1, name: 1 }, { unique: true });
CFTemplateSchema.plugin(tenantScope);

export default mongoose.model('CFTemplate', CFTemplateSchema);
