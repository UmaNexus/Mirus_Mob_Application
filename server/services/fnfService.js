import path from 'node:path';
import { resolveDefaultLetterTemplate } from '../controllers/letterTemplateController.js';
import { GENERATED_DOC_DIR, generateLetterFromTemplate, formatOfferDate } from './pdfService.js';
import { DEFAULT_LETTER_EMAIL } from '../models/LetterTemplate.js';
import { applyLetterText } from '../config/letterFields.js';
import { formatINR } from '../utils/money.js';
import { sendAppointmentLetter } from './emailService.js';
import { queueMailJob } from './mailQueue.js';

export const buildFNFFields = ({ record, user, company, fnfFields = {} } = {}) => {
  const firstName = user?.personalDetails?.firstName || '';
  const lastName = user?.personalDetails?.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || user?.email || 'Employee';
  const department = user?.employeeDetails?.department || user?.department || '';
  const email = user?.email || '';
  const phone = user?.personalDetails?.phone || user?.personalDetails?.mobile || user?.employeeDetails?.phone || '';
  const address = user?.personalDetails?.address || user?.personalDetails?.currentAddress || '';

  const inputReason = String(fnfFields.reason ?? record?.reason ?? 'Resignation').trim() || 'Resignation';
  const inputLastWorkingDay = fnfFields.lastWorkingDay || record?.lastWorkingDay;
  const inputAmount = fnfFields.amount ?? record?.fnfSettlement?.amount ?? 0;
  const normalizedAmount = Number(String(inputAmount).replace(/[₹,\s]/g, '')) || 0;
  const amountPaisa = (fnfFields.amount !== undefined && fnfFields.amount !== null && fnfFields.amount !== '')
    ? Math.round(normalizedAmount * 100)
    : Number(record?.fnfSettlement?.amount ?? 0) || 0;

  const lwd = formatOfferDate(inputLastWorkingDay || record?.lastWorkingDay);
  const resDate = formatOfferDate(record?.resignationDate);
  const issueDate = formatOfferDate(fnfFields.date || new Date());
  const amountDisplay = formatINR(amountPaisa);

  return {
    employeeName: name,
    firstName,
    lastName,
    employeeId: user?.employeeDetails?.employeeId || '',
    designation: user?.employeeDetails?.designation || 'Employee',
    role: user?.employeeDetails?.designation || 'Employee',
    department,
    Department: department,
    companyName: company?.name || 'Company',
    email,
    phone,
    address,
    amount: amountDisplay,
    Amount: amountDisplay,
    reason: inputReason,
    Reason: inputReason,
    resignationDate: resDate,
    ResignationDate: resDate,
    resignation_date: resDate,
    resignedDate: resDate,
    lastWorkingDay: lwd,
    LastWorkingDay: lwd,
    lastworkingday: lwd,
    date: issueDate,
    Date: issueDate
  };
};

export const fnfFileName = (name) => {
  const safe = String(name || 'Employee')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  return `FNF_Settlement_${safe}.pdf`;
};

/**
 * Generate an FNFLetter (if a default template exists) without emailing.
 * Returns the generated PDF relative path when created, otherwise null.
 */
export const generateFNFPdf = async ({ record, user, company, fnfFields = {} } = {}) => {
  const tpl = await resolveDefaultLetterTemplate('FNFLetter');
  if (!tpl) return null;
  const fields = buildFNFFields({ record, user, company, fnfFields });
  return generateLetterFromTemplate({ template: tpl, fields, company });
};

/**
 * Generate an FNFLetter (if a default template exists) and email it to the
 * employee. Returns the generated PDF relative path when created, otherwise null.
 */
export const generateAndEmailFNF = async ({ record, user, company, actor, fnfFields = {}, previewOnly = false } = {}) => {
  const tpl = await resolveDefaultLetterTemplate('FNFLetter');
  if (!tpl) return null;

  const fields = buildFNFFields({ record, user, company, fnfFields });
  const pdf = await generateLetterFromTemplate({ template: tpl, fields, company, destDir: GENERATED_DOC_DIR });
  if (previewOnly) return pdf;
  const absPdf = path.resolve(process.cwd(), pdf);

  const defaults = DEFAULT_LETTER_EMAIL.FNFLetter || {};
  const subjectTpl = (tpl?.emailSubject && String(tpl.emailSubject).trim()) || defaults.subject || '';
  const bodyTpl = (tpl?.emailBody && String(tpl.emailBody).trim()) || defaults.body || '';
  const subject = applyLetterText(subjectTpl, fields);
  const body = applyLetterText(bodyTpl, fields);

  const fileName = fnfFileName(fields.employeeName);
  const send = () => sendAppointmentLetter({ to: user.email, subject, body, pdfPath: absPdf, fileName });
  await queueMailJob(send);
  return pdf;
};

export default { generateFNFPdf, generateAndEmailFNF, buildFNFFields, fnfFileName };
