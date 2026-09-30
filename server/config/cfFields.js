/**
 * Blank fields users fill when generating a C&F agreement.
 * Keys are shared with AcroForm names on fillable template PDFs.
 *
 * Party-facing fields are required; legal boilerplate (date/place/margin/etc.)
 * is optional and prefilled from company/date defaults at issue time.
 */

export const CF_COMMON_SEND_FIELDS = [
  { key: 'recipientEmail', label: 'Recipient email', type: 'email', required: true, onPdf: false }
];

/**
 * Fields matching the C&F Agency Agreement PDF blanks:
 * - Page 1: Agency Name, Agency PAN, Office Address, Authorized Partner Name, Partner PAN, Assigned Territory
 * - Page 2: Effective From Date, Effective Up To Date
 * - Page 16: Company Witness, Agent Witness
 */
const CNF_PDF_FIELDS = [
  { key: 'partyName', label: 'Agency name (e.g. MSNR Logistics)', type: 'text', required: true, onPdf: true, section: 'agency' },
  { key: 'partyPan', label: 'Agency PAN (e.g. ABCDE1234F)', type: 'text', required: true, onPdf: true, section: 'agency' },
  { key: 'partnerName', label: 'Authorized partner / proprietor name', type: 'text', required: true, onPdf: true, section: 'agency' },
  { key: 'partnerPan', label: 'Partner PAN', type: 'text', required: false, onPdf: true, section: 'agency' },
  { key: 'territory', label: 'Assigned territory / State (e.g. Telangana)', type: 'text', required: true, onPdf: true, section: 'agency' },
  { key: 'partyAddress', label: 'Registered office address', type: 'textarea', required: true, onPdf: true, section: 'address' },
  { key: 'effectiveFrom', label: 'Effective from date (e.g. 14 September 2026)', type: 'text', required: false, onPdf: true, section: 'period' },
  { key: 'effectiveTo', label: 'Effective up to date (e.g. 14 September 2027)', type: 'text', required: false, onPdf: true, section: 'period' },
  { key: 'companyWitness', label: 'Company witness name', type: 'text', required: false, onPdf: true, section: 'witnesses' },
  { key: 'agentWitness', label: 'Agent witness name', type: 'text', required: false, onPdf: true, section: 'witnesses' }
];

/** @type {Record<string, Array<{key:string,label:string,type:string,required:boolean,onPdf?:boolean,section?:string}>>} */
export const CF_FIELDS_BY_TYPE = {
  CFAgent: [...CF_COMMON_SEND_FIELDS, ...CNF_PDF_FIELDS]
};

export const fieldsForType = (type) => CF_FIELDS_BY_TYPE[type] || CF_FIELDS_BY_TYPE.CFAgent;

export const pdfFieldKeysForType = (type) =>
  fieldsForType(type).filter((f) => f.onPdf !== false).map((f) => f.key);

export const validateCFFields = (type, values = {}) => {
  const defs = fieldsForType(type);
  const missing = defs.filter((f) => f.required && !String(values[f.key] ?? '').trim()).map((f) => f.label);
  return missing;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Prefill optional legal blanks from company + today when the operator leaves them empty. */
export const applyCFFieldDefaults = (fields = {}, company = null) => {
  const now = new Date();
  const out = { ...fields };
  const day = String(now.getDate());
  const month = MONTHS[now.getMonth()];
  const fullYear = String(now.getFullYear());
  const nextYear = String(now.getFullYear() + 1);

  if (!String(out.partyPan || '').trim()) out.partyPan = out.pan || 'N/A';
  if (!String(out.partnerName || '').trim()) out.partnerName = out.partyName || 'Partner';
  if (!String(out.partnerPan || '').trim()) out.partnerPan = out.partyPan || 'N/A';

  if (!String(out.effectiveFrom || '').trim()) {
    out.effectiveFrom = `${day} ${month} ${fullYear}`;
  }
  if (!String(out.effectiveTo || '').trim()) {
    out.effectiveTo = `${day} ${month} ${nextYear}`;
  }
  if (!String(out.effectivePeriod || '').trim()) {
    out.effectivePeriod = `${out.effectiveFrom} to ${out.effectiveTo}`;
  }

  // Contract clause defaults (Clauses 6, 37, 38 in C&F PDF)
  if (!String(out.warehouseArea || '').trim()) {
    out.warehouseArea = '1,000 sq. ft. (Safe & Hygienic)';
  }
  if (!String(out.securityDeposit || '').trim()) {
    out.securityDeposit = '50 LAKH (@ 5% p.a. quarterly)';
  }
  if (!String(out.commission || '').trim()) {
    out.commission = 'Rs. 1 Lakh/month or 1.40% on Net Sales';
  }
  if (!String(out.companyWitness || '').trim()) {
    out.companyWitness = out.witness1 || 'Authorized Staff';
  }
  if (!String(out.agentWitness || '').trim()) {
    out.agentWitness = out.witness2 || 'Authorized Witness';
  }

  // Backward compatibility keys
  if (!String(out.agreementDay || '').trim()) out.agreementDay = day;
  if (!String(out.agreementMonth || '').trim()) out.agreementMonth = month;
  if (!String(out.agreementYear || '').trim()) out.agreementYear = fullYear.slice(-2);
  if (!String(out.agreementPlace || '').trim()) {
    out.agreementPlace = company?.address?.city || company?.address?.state || 'Hyderabad';
  }
  if (!String(out.margin || '').trim()) out.margin = out.commission;
  if (!String(out.godownAddress || '').trim()) out.godownAddress = out.partyAddress || 'As agreed';

  return out;
};
