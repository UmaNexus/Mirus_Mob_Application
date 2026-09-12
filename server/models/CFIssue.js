import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
import { CF_TEMPLATE_TYPES } from './CFTemplate.js';

/**
 * CFIssue — a generated & emailed C&F agreement filled from a CFTemplate.
 * Stores recipient, filled blank values, and the generated PDF path.
 */
const CFIssueSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'CFTemplate', required: true, index: true },
  type: { type: String, enum: CF_TEMPLATE_TYPES, required: true, index: true },
  templateName: { type: String, trim: true },
  recipientEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
  partyName: { type: String, trim: true, default: '' },
  fieldValues: { type: Map, of: String, default: {} },
  pdfFileUrl: { type: String, required: true },
  status: { type: String, enum: ['generated', 'sent', 'failed'], default: 'generated', index: true },
  sentAt: { type: Date, default: null },
  emailError: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

CFIssueSchema.plugin(tenantScope);

export default mongoose.model('CFIssue', CFIssueSchema);
