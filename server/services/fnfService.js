import path from 'node:path';
import { resolveDefaultLetterTemplate } from '../controllers/letterTemplateController.js';
import { GENERATED_DOC_DIR, generateLetterFromTemplate } from './pdfService.js';
import { DEFAULT_LETTER_EMAIL } from '../models/LetterTemplate.js';
import { applyLetterText } from '../config/letterFields.js';
import { formatINR } from '../utils/money.js';
import { sendAppointmentLetter } from './emailService.js';
import { queueMailJob } from './mailQueue.js';

/**
 * Generate an FNFLetter (if a default template exists) and email it to the
 * employee. Returns the generated PDF relative path when created, otherwise null.
 */
export const generateAndEmailFNF = async ({ record, user, company, actor, fnfFields = {}, previewOnly = false } = {}) => {
  const tpl = await resolveDefaultLetterTemplate('FNFLetter');
  if (!tpl) return null;

  const firstName = user.personalDetails?.firstName || '';
  const lastName = user.personalDetails?.lastName || '';
  const name = `${firstName} ${lastName}`.trim();
  const department = user.employeeDetails?.department || user.department || '';
  const email = user.email || '';
  const phone = user.personalDetails?.phone || user.personalDetails?.mobile || user.employeeDetails?.phone || '';
  const address = user.personalDetails?.address || user.personalDetails?.currentAddress || '';
  const inputReason = String(fnfFields.reason ?? record?.reason ?? 'Resignation').trim() || 'Resignation';
  const inputLastWorkingDay = fnfFields.lastWorkingDay || record?.lastWorkingDay;
  const inputAmount = fnfFields.amount ?? record?.fnfSettlement?.amount ?? 0;
  const normalizedAmount = Number(String(inputAmount).replace(/[₹,\s]/g, '')) || 0;
  const amountPaisa = (fnfFields.amount !== undefined && fnfFields.amount !== null && fnfFields.amount !== '')
    ? Math.round(normalizedAmount * 100)
    : Number(record?.fnfSettlement?.amount ?? 0) || 0;
  const lwd = inputLastWorkingDay ? new Date(inputLastWorkingDay).toDateString() : new Date(record.lastWorkingDay).toDateString();
  const amountDisplay = formatINR(amountPaisa);
  const fields = {
    employeeName: name,
    firstName,
    lastName,
    employeeId: user.employeeDetails?.employeeId || '',
    designation: user.employeeDetails?.designation || 'Employee',
    role: user.employeeDetails?.designation || 'Employee',
    department,
    companyName: company?.name || 'Company',
    email,
    phone,
    address,
    amount: amountDisplay,
    Amount: amountDisplay,
    reason: inputReason,
    Reason: inputReason,
    lastWorkingDay: lwd,
    lastworkingday: lwd,
    date: inputLastWorkingDay || record.lastWorkingDay,
    Date: inputLastWorkingDay || record.lastWorkingDay
  };

  const pdf = await generateLetterFromTemplate({ template: tpl, fields, company, destDir: GENERATED_DOC_DIR });
  if (previewOnly) return pdf;

  const absPdf = path.resolve(process.cwd(), pdf);

  const defaults = DEFAULT_LETTER_EMAIL.FNFLetter || {};
  const subjectTpl = (tpl?.emailSubject && String(tpl.emailSubject).trim()) || defaults.subject || '';
  const bodyTpl = (tpl?.emailBody && String(tpl.emailBody).trim()) || defaults.body || '';
  const subject = applyLetterText(subjectTpl, fields);
  const body = applyLetterText(bodyTpl, fields);

  const send = () => sendAppointmentLetter({ to: user.email, subject, body, pdfPath: absPdf, fileName: `${name}-fnf.pdf` });
  await queueMailJob(send);
  return pdf;
};

export default { generateAndEmailFNF };
