/**
 * Blank fields filled when generating a letter from a LetterTemplate.
 * Keys align with AcroForm names on fillable template PDFs and {{placeholders}}.
 */

export const LETTER_COMMON_FIELDS = [
  { key: 'employeeName', label: 'Employee / candidate name', type: 'text', required: true, onPdf: true },
  { key: 'designation', label: 'Designation / position', type: 'text', required: true, onPdf: true },
  { key: 'department', label: 'Department', type: 'text', required: false, onPdf: true },
  { key: 'date', label: 'Letter date', type: 'text', required: false, onPdf: true },
  { key: 'companyName', label: 'Company name', type: 'text', required: false, onPdf: true },
  { key: 'location', label: 'Job location', type: 'text', required: false, onPdf: true }
];

const OFFER_EXTRA = [
  { key: 'joiningDate', label: 'Joining date', type: 'text', required: true, onPdf: true },
  { key: 'ctc', label: 'Annual CTC', type: 'text', required: false, onPdf: true },
  { key: 'offerDate', label: 'Offer date', type: 'text', required: false, onPdf: true },
  { key: 'phone', label: 'Mobile / phone', type: 'text', required: false, onPdf: true },
  { key: 'email', label: 'Email', type: 'text', required: false, onPdf: true },
  { key: 'address', label: 'Full address', type: 'text', required: false, onPdf: true },
  { key: 'companyLocation', label: 'Company / organisation base location', type: 'text', required: false, onPdf: true },
  { key: 'jobLocation', label: 'Employee job / posting location', type: 'text', required: false, onPdf: true }
];

const APPOINTMENT_EXTRA = [
  { key: 'joiningDate', label: 'Effective / joining date', type: 'text', required: true, onPdf: true },
  { key: 'employeeId', label: 'Employee ID', type: 'text', required: false, onPdf: true },
  { key: 'firstName', label: 'First name', type: 'text', required: false, onPdf: true },
  { key: 'phone', label: 'Mobile / phone', type: 'text', required: false, onPdf: true },
  { key: 'email', label: 'Email', type: 'text', required: false, onPdf: true },
  { key: 'address', label: 'Full address', type: 'text', required: false, onPdf: true },
  { key: 'addressLine1', label: 'Address line 1', type: 'text', required: false, onPdf: true },
  { key: 'addressLine2', label: 'Address line 2', type: 'text', required: false, onPdf: true },
  { key: 'addressCityLine', label: 'City / state / PIN', type: 'text', required: false, onPdf: true },
  { key: 'trainingVenue', label: 'Training venue', type: 'text', required: false, onPdf: true },
  { key: 'joiningTime', label: 'Joining time', type: 'text', required: false, onPdf: true }
];

/** Aliases so templates using {{Name}} / {{Role}} / {{Date of joining}} still fill. */
export const LETTER_FIELD_ALIASES = {
  Name: 'employeeName',
  name: 'employeeName',
  'Employee Name': 'employeeName',
  'Employee name': 'employeeName',
  'Full Name': 'employeeName',
  'Full name': 'employeeName',
  'Candidate Full Name': 'employeeName',
  'Candidate full name': 'employeeName',
  Role: 'designation',
  role: 'designation',
  Position: 'designation',
  'Date of joining': 'joiningDate',
  'date of joining': 'joiningDate',
  ResignationDate: 'resignationDate',
  resignationDate: 'resignationDate',
  Date: 'date',
  'Last Working Day': 'lastWorkingDay',
  'Last working day': 'lastWorkingDay',
  Location: 'location',
  Address: 'address',
  Email: 'email',
  Phone: 'phone',
  Mobile: 'phone',
  Amount: 'amount',
  amount: 'amount',
  Reason: 'reason',
  reason: 'reason',
  Package: 'ctc',
  package: 'ctc',
  CTC: 'ctc',
  'Total CTC': 'ctc',
  'Package in words': 'ctcWords',
  'package in words': 'ctcWords',
  'Basic salary': 'basicSalary',
  'House Rent Allowance': 'hra',
  HRA: 'hra',
  'Leave Travel allowance': 'lta',
  LTA: 'lta',
  'Special allowance': 'specialAllowance',
  'Gross Month salary': 'grossSalary',
  PF: 'pf'
};

const SERVICE_EXTRA = [
  { key: 'employeeId', label: 'Employee ID', type: 'text', required: false, onPdf: true },
  { key: 'joiningDate', label: 'Date of joining', type: 'text', required: false, onPdf: true }
];

const FNF_EXTRA = [
  { key: 'employeeId', label: 'Employee ID', type: 'text', required: false, onPdf: true },
  { key: 'lastWorkingDay', label: 'Last working day', type: 'text', required: true, onPdf: true },
  { key: 'resignationDate', label: 'Resignation date', type: 'text', required: false, onPdf: true },
  { key: 'amount', label: 'Full & final amount', type: 'text', required: false, onPdf: true },
  { key: 'reason', label: 'Exit / resignation reason', type: 'text', required: false, onPdf: true }
];

/** @type {Record<string, Array<{key:string,label:string,type:string,required:boolean,onPdf?:boolean}>>} */
export const LETTER_FIELDS_BY_TYPE = {
  OfferLetter: [...LETTER_COMMON_FIELDS, ...OFFER_EXTRA],
  AppointmentLetter: [...LETTER_COMMON_FIELDS, ...APPOINTMENT_EXTRA],
  ServiceLetter: [...LETTER_COMMON_FIELDS, ...SERVICE_EXTRA],
  FNFLetter: [...LETTER_COMMON_FIELDS, ...FNF_EXTRA]
};

export const fieldsForLetterType = (type) => LETTER_FIELDS_BY_TYPE[type] || LETTER_COMMON_FIELDS;

export const pdfFieldKeysForLetterType = (type) =>
  fieldsForLetterType(type).filter((f) => f.onPdf !== false).map((f) => f.key);

export const validateLetterFields = (type, values = {}) => {
  const defs = fieldsForLetterType(type);
  return defs.filter((f) => f.required && !String(values[f.key] ?? '').trim()).map((f) => f.label);
};

/** Resolve a placeholder key through aliases to a field value. */
export const resolveLetterField = (key, fields = {}) => {
  const k = String(key ?? '').trim();
  if (!k) return '';
  if (fields[k] != null && String(fields[k]).trim() !== '') return String(fields[k]).trim();
  const alias = LETTER_FIELD_ALIASES[k];
  if (alias && fields[alias] != null && String(fields[alias]).trim() !== '') {
    return String(fields[alias]).trim();
  }
  // Case-insensitive fallback
  const lower = k.toLowerCase();
  for (const [fk, fv] of Object.entries(fields)) {
    if (String(fk).toLowerCase() === lower && String(fv ?? '').trim() !== '') {
      return String(fv).trim();
    }
  }
  return '';
};

/** Substitute {{placeholders}} in body paragraphs. */
export const applyLetterPlaceholders = (paragraphs = [], fields = {}) =>
  paragraphs.map((p) => applyLetterText(p, fields));

/** Substitute {{placeholders}} in a single string (email subject/body, etc.). */
export const applyLetterText = (text = '', fields = {}) =>
  String(text ?? '').replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const v = resolveLetterField(key, fields);
    return v || `{{${String(key).trim()}}}`;
  });
