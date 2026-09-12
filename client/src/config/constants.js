export const ROLES = ['admin', 'hr', 'employee'];
// Document types shown in the upload dropdown (RelievingLetter intentionally omitted).
export const DOC_TYPES = [
  { value: 'PAN', label: 'PAN' },
  { value: 'Aadhar', label: 'Aadhar' },
  { value: 'Passport', label: 'Passport' },
  { value: 'VoterID', label: 'Voter ID' },
  { value: 'EducationCertificate', label: 'Education Certificate' },
  { value: 'Payslip', label: 'Payslip' }
];

// Friendly labels for displaying any stored documentType (incl. legacy values).
export const DOC_TYPE_LABEL = {
  PAN: 'PAN', Aadhar: 'Aadhar', Passport: 'Passport', VoterID: 'Voter ID',
  EducationCertificate: 'Education Certificate', DegreeCertificate: 'Education Certificate',
  RelievingLetter: 'Relieving Letter', Payslip: 'Payslip',
  PreviousOfferLetter: 'Previous Offer Letter', ServiceOrFnfLetter: 'Service Letter / FNF'
};
export const OFFER_STATUSES = ['sent', 'pending', 'signed', 'accepted', 'declined'];
export const CALC_TYPES = [
  { value: 'fixed', label: 'Fixed amount (₹)' },
  { value: 'percentage_of_ctc', label: '% of CTC' },
  { value: 'percentage_of_basic', label: '% of Basic' },
  { value: 'balance_of_ctc', label: 'Balance of CTC' }
];
export const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
];
export const YEARS = [2024, 2025, 2026, 2027];

export const fullName = (u) =>
  `${u?.personalDetails?.firstName || ''} ${u?.personalDetails?.lastName || ''}`.trim() || '—';
