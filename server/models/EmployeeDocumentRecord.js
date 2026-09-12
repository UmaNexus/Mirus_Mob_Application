import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * EmployeeDocumentRecord (Epic 17) — one uploaded document instance saved
 * against an employee, based on a DocumentType. For 'read' types the employee
 * accepts the terms; for 'write' types the employee fills the PDF's AcroForm
 * fields (values stored + a flattened `filledFileUrl` produced).
 */
const EmployeeDocumentRecordSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Optional catalog type; free-text description is the primary label. */
  documentTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentType', default: null, index: true },
  description: { type: String, required: true, trim: true },
  section: { type: String, trim: true }, // denormalized from the type for easy grouping
  accessMode: { type: String, enum: ['read', 'write'], required: true },

  sourceFileUrl: { type: String, required: true }, // the uploaded PDF
  filledFileUrl: { type: String, default: null },  // flattened, after write-mode fill
  fieldValues: { type: mongoose.Schema.Types.Mixed, default: {} },

  status: { type: String, enum: ['pending', 'acknowledged', 'submitted'], default: 'pending', index: true },
  termsAccepted: { type: Boolean, default: false },
  acknowledgedAt: { type: Date, default: null },
  ipAddress: { type: String, default: null },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

EmployeeDocumentRecordSchema.plugin(tenantScope);

export default mongoose.model('EmployeeDocumentRecord', EmployeeDocumentRecordSchema);
