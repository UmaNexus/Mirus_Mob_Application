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

const PARTY = [
  { key: 'partyName', label: 'Party name (Mr/Mrs/Ms …)', type: 'text', required: true, onPdf: true },
  { key: 'partyAddress', label: 'Party address', type: 'textarea', required: true, onPdf: true },
  { key: 'territory', label: 'Assigned territory / market', type: 'text', required: true, onPdf: true }
];

const OPTIONAL_LEGAL = [
  { key: 'agreementDay', label: 'Agreement day (e.g. 14)', type: 'text', required: false, onPdf: true },
  { key: 'agreementMonth', label: 'Agreement month (e.g. July)', type: 'text', required: false, onPdf: true },
  { key: 'agreementYear', label: 'Agreement year (e.g. 26)', type: 'text', required: false, onPdf: true },
  { key: 'agreementPlace', label: 'Place of agreement', type: 'text', required: false, onPdf: true },
  { key: 'margin', label: 'Margin (e.g. 15%)', type: 'text', required: false, onPdf: true },
  { key: 'godownAddress', label: 'Godown / warehouse address', type: 'text', required: false, onPdf: true },
  { key: 'monthlyTarget', label: 'Monthly sales target', type: 'text', required: false, onPdf: true },
  { key: 'securityDeposit', label: 'Security deposit (₹)', type: 'text', required: false, onPdf: true },
  { key: 'witness1', label: 'Witness 1 name', type: 'text', required: false, onPdf: true },
  { key: 'witness2', label: 'Witness 2 name', type: 'text', required: false, onPdf: true }
];

/** @type {Record<string, Array<{key:string,label:string,type:string,required:boolean,onPdf?:boolean}>>} */
export const CF_FIELDS_BY_TYPE = {
  CFAgent: [...CF_COMMON_SEND_FIELDS, ...PARTY, ...OPTIONAL_LEGAL],
  CFDistributor: [...CF_COMMON_SEND_FIELDS, ...PARTY, ...OPTIONAL_LEGAL],
  CFWholesaler: [...CF_COMMON_SEND_FIELDS, ...PARTY, ...OPTIONAL_LEGAL]
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
  if (!String(out.agreementDay || '').trim()) out.agreementDay = String(now.getDate());
  if (!String(out.agreementMonth || '').trim()) out.agreementMonth = MONTHS[now.getMonth()];
  if (!String(out.agreementYear || '').trim()) out.agreementYear = String(now.getFullYear()).slice(-2);
  if (!String(out.agreementPlace || '').trim()) {
    out.agreementPlace = company?.address?.city || company?.address?.state || 'Mumbai';
  }
  if (!String(out.margin || '').trim()) out.margin = '15%';
  if (!String(out.godownAddress || '').trim()) {
    const a = company?.address;
    out.godownAddress = [a?.street, a?.city, a?.state].filter(Boolean).join(', ') || 'As agreed';
  }
  return out;
};
