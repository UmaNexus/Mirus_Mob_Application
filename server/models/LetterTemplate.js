import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

/**
 * LetterTemplate — per-company letter PDFs (C&F-style): upload a template with
 * blank/AcroForm fields, fill at generate/send time, seal with company branding.
 */
export const LETTER_TYPES = ['OfferLetter', 'AppointmentLetter', 'ServiceLetter', 'FNFLetter'];

export const LETTER_TYPE_LABELS = {
  OfferLetter: 'Offer Letter',
  AppointmentLetter: 'Appointment Letter',
  ServiceLetter: 'Service Letter',
  FNFLetter: 'Full & Final (FNF) Letter'
};

export const LETTER_PLACEHOLDERS = [
  'employeeName', 'designation', 'department', 'employeeId', 'date', 'Date',
  'companyName', 'joiningDate', 'lastWorkingDay', 'ctc', 'offerDate', 'location',
  'address', 'email', 'phone', 'offerUrl'
];

/** Default email subject/body per letter type ({{placeholders}} substituted at send time). */
export const DEFAULT_LETTER_EMAIL = {
  OfferLetter: {
    subject: 'Your employment offer from {{companyName}}',
    body: `Hi {{employeeName}},

Please find attached your Offer of Employment for the position of {{designation}} at {{companyName}}.

You can also view and e-sign your offer online here:
{{offerUrl}}

Joining date: {{joiningDate}}
Annual CTC: {{ctc}}

Regards,
{{companyName}}`
  },
  AppointmentLetter: {
    subject: 'Your appointment letter from {{companyName}}',
    body: `Dear {{employeeName}},

Please find attached your Letter of Appointment for the position of {{designation}} at {{companyName}}, effective {{joiningDate}}.

Regards,
{{companyName}}`
  },
  ServiceLetter: {
    subject: 'Service certificate from {{companyName}}',
    body: `Dear {{employeeName}},

Please find attached your service certificate from {{companyName}}.

Regards,
{{companyName}}`
  },
  FNFLetter: {
    subject: 'Full & Final settlement letter from {{companyName}}',
    body: `Dear {{employeeName}},

Please find attached your Full & Final settlement letter from {{companyName}}.
Last working day: {{lastWorkingDay}}.

Regards,
{{companyName}}`
  }
};

const LetterTemplateSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  type: { type: String, enum: LETTER_TYPES, required: true, index: true },
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  bodyParagraphs: [{ type: String }],
  /** Placeholder keys detected from the last uploaded PDF ({{…}} and/or AcroForm names). */
  detectedPlaceholders: [{ type: String }],
  /** Email subject with {{placeholders}} — used when generating/sending the letter. */
  emailSubject: { type: String, trim: true, default: '' },
  /** Email body (plain text) with {{placeholders}} — PDF is attached at send time. */
  emailBody: { type: String, trim: true, default: '' },
  fileUrl: { type: String, default: null },
  originalFileName: { type: String, trim: true },
  mimeType: { type: String, trim: true, default: 'application/pdf' },
  isDefault: { type: Boolean, default: false, index: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

LetterTemplateSchema.index({ companyId: 1, type: 1, name: 1 }, { unique: true });
LetterTemplateSchema.plugin(tenantScope);

export default mongoose.model('LetterTemplate', LetterTemplateSchema);
