import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * DocumentType (Epic 17) — a reusable, HR-defined type for UPLOADED documents
 * (Form 16, insurance, bonus letters, policies). Each type belongs to a
 * `section` and declares how the employee interacts with it:
 *   - kind 'read'  => employee must accept terms (read-confirmation).
 *   - kind 'write' => employee fills the PDF's existing AcroForm fields.
 * `fields` describe the custom inputs captured alongside the file.
 */
const FieldDefSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'number', 'date', 'dropdown', 'checkbox'], default: 'text' },
  required: { type: Boolean, default: false },
  options: [{ type: String }] // for dropdown
}, { _id: false });

const DocumentTypeSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true }, // e.g. Tax, Payroll, Compliance, Policies
  kind: { type: String, enum: ['read', 'write'], default: 'read' },
  fields: [FieldDefSchema],
  termsText: { type: String, trim: true }, // shown for 'read' acceptance
  active: { type: Boolean, default: true }
}, { timestamps: true });

DocumentTypeSchema.index({ companyId: 1, name: 1 }, { unique: true });
DocumentTypeSchema.plugin(tenantScope);

export default mongoose.model('DocumentType', DocumentTypeSchema);
