import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * EmployeeDocument (Epic 10) — a company-issued, system-GENERATED statutory
 * document (appointment letter, NDA, handbook acknowledgment, code of conduct)
 * sealed with the company stamp + signatory signature. The employee then either
 * acknowledges (checkbox) or counter-signs.
 */
export const GENERATED_DOC_TYPES = ['AppointmentLetter', 'NDA', 'Handbook', 'CodeOfConduct'];

const EmployeeDocumentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: GENERATED_DOC_TYPES, required: true },
  title: { type: String, required: true, trim: true },
  inputs: { type: mongoose.Schema.Types.Mixed, default: {} }, // date, designation, extra fields used to generate

  pdfFileUrl: { type: String, required: true },
  acknowledgedPdfFileUrl: { type: String, default: null }, // counter-signed copy, if any

  requiresSignature: { type: Boolean, default: false }, // true => must counter-sign; false => checkbox acknowledge
  status: { type: String, enum: ['issued', 'acknowledged'], default: 'issued', index: true },
  acknowledgedAt: { type: Date, default: null },
  signature: {
    signatureBase64: { type: String, default: null },
    signedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null }
  },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

EmployeeDocumentSchema.plugin(tenantScope);

export default mongoose.model('EmployeeDocument', EmployeeDocumentSchema);
