import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import OfferLetter from '../models/OfferLetter.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { computeBreakdown } from '../utils/salaryEngine.js';
import { rupeesToPaisa, formatINR } from '../utils/money.js';
import { generateToken } from '../utils/tokens.js';
import { generateOfferLetterPdf } from '../services/pdfService.js';
import { upsertCandidateUser } from '../services/candidateService.js';
import { provisionEmployee } from '../services/provisioningService.js';
import { sendOfferInvite } from '../services/emailService.js';
import { queueMailJob } from '../services/mailQueue.js';
import { issueAndEmailAppointmentLetter } from '../services/appointmentLetterService.js';
import { acceptOfferForProvisioning } from '../services/offerService.js';
import { clientOrigin } from '../utils/clientOrigin.js';
import Company from '../models/Company.js';
import { resolveDefaultLetterTemplate } from './letterTemplateController.js';
import { applyLetterText } from '../config/letterFields.js';
import { DEFAULT_LETTER_EMAIL } from '../models/LetterTemplate.js';
import { logActivity } from '../services/activityService.js';

const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const exposeToken = () => process.env.NODE_ENV !== 'production';

const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const resolveTemplate = async ({ templateId, templateName }) => {
  let tpl = null;
  if (templateId && mongoose.isValidObjectId(templateId)) tpl = await SalaryStructureTemplate.findById(templateId);
  else if (templateName) tpl = await SalaryStructureTemplate.findOne({ name: templateName });
  if (!tpl) throw new ApiError(404, `Salary template not found (${templateId || templateName})`);
  return tpl;
};

const buildOfferEmailFields = ({
  fullName, position, department, joiningDate, offerDate, location, company, annualCTCPaisa, offerUrl
}) => ({
  employeeName: fullName || '',
  designation: position || '',
  department: department || '',
  joiningDate: fmtDate(joiningDate),
  offerDate: fmtDate(offerDate),
  date: fmtDate(offerDate || new Date()),
  location: location || '',
  companyName: company?.name || 'Company',
  ctc: annualCTCPaisa != null ? formatINR(annualCTCPaisa) : '',
  offerUrl: offerUrl || '',
  employeeId: '',
  lastWorkingDay: ''
});

/** Render email subject/body from the Offer letter template (or defaults). */
const renderOfferEmail = (letterTpl, fields) => {
  const defaults = DEFAULT_LETTER_EMAIL.OfferLetter;
  const subjectTpl = (letterTpl?.emailSubject && String(letterTpl.emailSubject).trim())
    || defaults.subject;
  const bodyTpl = (letterTpl?.emailBody && String(letterTpl.emailBody).trim())
    || defaults.body;
  return {
    subject: applyLetterText(subjectTpl, fields),
    body: applyLetterText(bodyTpl, fields)
  };
};

const offerPdfAbs = (rel) => path.resolve(process.cwd(), rel);

const deliverOfferEmail = async ({ offer, fullName, offerUrl, subject, body, annualCTCPaisa, company, letterTpl }) => {
  let email = { subject, body };
  if (!email.subject || !email.body) {
    const fields = buildOfferEmailFields({
      fullName: fullName || offer.fullName,
      position: offer.position,
      department: offer.department,
      joiningDate: offer.joiningDate,
      offerDate: offer.offerDate,
      location: offer.location,
      company,
      annualCTCPaisa,
      offerUrl
    });
    const rendered = renderOfferEmail(letterTpl, fields);
    email = {
      subject: email.subject || rendered.subject,
      body: email.body || rendered.body
    };
  }
  const safeName = String(fullName || offer.fullName || 'candidate').replace(/[^\w.-]+/g, '-');
  return sendOfferInvite({
    to: offer.candidateEmail,
    fullName: fullName || offer.fullName,
    offerUrl,
    subject: email.subject,
    body: email.body,
    pdfPath: offerPdfAbs(offer.pdfFileUrl),
    fileName: `Offer-Letter-${safeName}.pdf`
  });
};

/**
 * Core offer-staging logic shared by single + bulk creation.
 * Creates/locates the candidate user, freezes salary, renders PDF, mints magic link.
 * Emails only when `sendEmail` is true (bulk / default API). Preview flow uses sendEmail:false.
 * @returns {{ offer, accessToken, offerUrl, emailPreview }}
 */
const createOfferCore = async (payload, { sendEmail = true } = {}) => {
  const { candidateEmail, fullName, position, department, joiningDate, offerDate } = payload;
  const annualCTC = Number(payload.annualCTC);
  if (!Number.isFinite(annualCTC) || annualCTC <= 0) throw new ApiError(400, 'annualCTC must be a positive number');

  const template = await resolveTemplate(payload);
  const offerDt = offerDate || new Date();
  const user = await upsertCandidateUser({
    email: candidateEmail,
    fullName,
    joiningDate,
    offerDate: offerDt
  });

  // Persist offer phone onto the candidate when profile still has the placeholder.
  const offerPhone = String(payload.phone || '').trim();
  if (offerPhone) {
    const current = String(user.contactInfo?.personalMobile || '').replace(/\D/g, '');
    if (!current || /^0+$/.test(current)) {
      user.contactInfo.personalMobile = offerPhone;
      await user.save();
    }
  }

  const annualCTCPaisa = rupeesToPaisa(annualCTC);
  const breakdown = computeBreakdown(template, annualCTCPaisa);

  const assignment = await EmployeeSalaryAssignment.findOneAndUpdate(
    { userId: user._id },
    { userId: user._id, templateId: template._id, annualCTC: annualCTCPaisa, frozenMonthlyBreakdown: breakdown },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  const company = await Company.findById(user.companyId);
  const letterTpl = await resolveDefaultLetterTemplate('OfferLetter');

  // Always generate the Mirus-style offer PDF
  const { pdfFileUrl, acceptancePlacement } = await generateOfferLetterPdf({
    fullName,
    position,
    department,
    offerDate: offerDt,
    joiningDate,
    breakdown,
    annualCTC: annualCTCPaisa,
    company,
    candidateEmail: String(candidateEmail).toLowerCase().trim(),
    phone: payload.phone || '',
    city: payload.city || '',
    location: payload.location || '',
    acceptByDate: payload.acceptByDate || null,
    bodyParagraphs: letterTpl?.bodyParagraphs || null
  });

  const { raw, hash } = generateToken();
  const offerUrl = `${clientOrigin()}/offer/${raw}`;
  const emailPreview = renderOfferEmail(letterTpl, buildOfferEmailFields({
    fullName,
    position,
    department,
    joiningDate,
    offerDate: offerDt,
    location: payload.location || '',
    company,
    annualCTCPaisa,
    offerUrl
  }));

  const offer = await OfferLetter.create({
    candidateEmail: String(candidateEmail).toLowerCase().trim(),
    fullName, position, department,
    phone: payload.phone || '',
    city: payload.city || '',
    location: payload.location || '',
    offerDate: offerDt,
    joiningDate,
    salaryAssignmentId: assignment._id,
    status: sendEmail ? 'sent' : 'pending',
    pdfFileUrl,
    acceptancePlacement,
    accessTokenHash: hash,
    accessTokenExpires: new Date(Date.now() + ACCESS_TOKEN_TTL_MS)
  });

  let email = null;
  if (sendEmail) {
    // Do not block the HTTP response on SMTP + large PDF upload.
    email = await queueMailJob(() => deliverOfferEmail({
      offer,
      fullName,
      offerUrl,
      subject: emailPreview.subject,
      body: emailPreview.body
    }));
  }

  return { offer, accessToken: raw, offerUrl, emailPreview, email };
};

/**
 * POST /api/offers
 * US 3.1 — stage a single electronic offer.
 * Body: { …, sendEmail?: boolean } — when false, returns emailPreview for review before send.
 */
export const createOffer = asyncHandler(async (req, res) => {
  const sendEmail = !(req.body.sendEmail === false || req.body.sendEmail === 'false');
  const { offer, accessToken, offerUrl, emailPreview, email } = await createOfferCore(req.body, { sendEmail });
  await logActivity({
    actor: req.user,
    action: sendEmail ? 'offer.send' : 'offer.create',
    entityType: 'OfferLetter',
    entityId: offer._id,
    message: sendEmail
      ? `Offer sent to ${offer.fullName} (${offer.candidateEmail})`
      : `Offer drafted for ${offer.fullName}`
  });
  res.status(201).json({
    success: true,
    message: sendEmail
      ? (email?.queued ? 'Offer staged — email queued for delivery' : 'Offer staged and sent')
      : 'Offer generated — review email before sending',
    offer,
    email,
    emailPreview,
    // Always return offerUrl for the preview step (HR sees the signing link in the draft).
    offerUrl,
    ...(exposeToken() || !sendEmail ? { accessToken } : {})
  });
});

/**
 * POST /api/offers/:id/send — send offer email after preview (or re-send).
 * Body: { subject?, body?, remint?: boolean }
 * - First send (status pending): uses subject/body from the preview dialog (signing link already filled).
 * - Re-send: remints magic link and re-renders from the letter template unless subject/body override both provided with remint:false.
 */
export const sendOfferEmail = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status === 'accepted') throw new ApiError(400, 'Offer already accepted');

  const isFirstSend = offer.status === 'pending';
  const company = await Company.findById(offer.companyId);
  const letterTpl = await resolveDefaultLetterTemplate('OfferLetter');
  const assignment = await EmployeeSalaryAssignment.findById(offer.salaryAssignmentId);

  let accessToken = null;
  let offerUrl = '';
  let subject = req.body.subject != null ? String(req.body.subject) : '';
  let body = req.body.body != null ? String(req.body.body) : '';

  // First send after preview: keep the existing magic-link (already in subject/body).
  // Re-send / missing copy: remint and render from the letter template.
  if (!(isFirstSend && subject && body)) {
    const { raw, hash } = generateToken();
    offer.accessTokenHash = hash;
    offer.accessTokenExpires = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
    accessToken = raw;
    offerUrl = `${clientOrigin()}/offer/${raw}`;
    const rendered = renderOfferEmail(letterTpl, buildOfferEmailFields({
      fullName: offer.fullName,
      position: offer.position,
      department: offer.department,
      joiningDate: offer.joiningDate,
      offerDate: offer.offerDate,
      location: offer.location,
      company,
      annualCTCPaisa: assignment?.annualCTC,
      offerUrl
    }));
    subject = rendered.subject;
    body = rendered.body;
  }

  const email = await queueMailJob(() => deliverOfferEmail({
    offer,
    fullName: offer.fullName,
    offerUrl,
    subject,
    body,
    annualCTCPaisa: assignment?.annualCTC,
    company,
    letterTpl
  }));

  if (offer.status === 'pending') offer.status = 'sent';
  await offer.save();

  res.status(200).json({
    success: true,
    message: email?.queued ? 'Offer email queued for delivery' : 'Offer email sent',
    offer,
    email,
    emailPreview: { subject, body },
    ...(exposeToken() ? { accessToken, offerUrl } : {})
  });
});

const cell = (row, idx) => {
  const v = row.getCell(idx).value;
  if (v && typeof v === 'object' && 'text' in v) return v.text; // rich text / hyperlink
  if (v && typeof v === 'object' && 'result' in v) return v.result; // formula
  return v;
};

/**
 * POST /api/offers/bulk
 * US 3.2 — ingest an .xlsx roster. Header row (row 1) must contain the columns:
 * fullName | email | position | department | annualCTC | joiningDate | templateName
 * Each row is processed independently; malformed rows are reported by index
 * without aborting the batch.
 */
export const bulkCreateOffers = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No roster file uploaded (field "roster")');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, 'The spreadsheet has no worksheets');

  // Map header names -> column index (case-insensitive).
  const headerRow = sheet.getRow(1);
  const colOf = {};
  headerRow.eachCell((c, idx) => { colOf[String(c.value).trim().toLowerCase()] = idx; });

  const required = ['fullname', 'email', 'position', 'department', 'annualctc', 'joiningdate', 'templatename'];
  const missing = required.filter((h) => !colOf[h]);
  if (missing.length) throw new ApiError(400, `Missing required columns: ${missing.join(', ')}`);

  const results = { created: [], failed: [] };
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const email = cell(row, colOf.email);
    if (!email) continue; // skip blank rows

    try {
      const { offer } = await createOfferCore({
        candidateEmail: email,
        fullName: cell(row, colOf.fullname),
        position: cell(row, colOf.position),
        department: cell(row, colOf.department),
        annualCTC: cell(row, colOf.annualctc),
        joiningDate: cell(row, colOf.joiningdate),
        templateName: cell(row, colOf.templatename)
      });
      results.created.push({ row: r, offerId: offer._id, email: offer.candidateEmail });
    } catch (err) {
      results.failed.push({ row: r, email, error: err.message });
    }
  }

  res.status(201).json({
    success: true,
    message: `Processed roster: ${results.created.length} created, ${results.failed.length} failed`,
    ...results
  });
});

// Present a frozen breakdown with formatted display strings.
const presentBreakdown = (assignment) => {
  if (!assignment?.frozenMonthlyBreakdown) return null;
  const b = assignment.frozenMonthlyBreakdown;
  const disp = (items) => items.map((i) => ({ key: i.key, label: i.label, monthlyAmount: i.monthlyAmount, display: formatINR(i.monthlyAmount) }));
  return {
    annualCTC: assignment.annualCTC,
    annualCTCDisplay: formatINR(assignment.annualCTC),
    earnings: disp(b.earnings),
    deductions: disp(b.deductions),
    grossEarnings: b.grossEarnings,
    grossEarningsDisplay: formatINR(b.grossEarnings),
    totalDeductions: b.totalDeductions,
    totalDeductionsDisplay: formatINR(b.totalDeductions),
    netTakeHome: b.netTakeHome,
    netTakeHomeDisplay: formatINR(b.netTakeHome)
  };
};

/**
 * GET /api/offers/mine
 * The authenticated user's own (latest) offer letter + compensation breakdown.
 */
export const getMyOffer = asyncHandler(async (req, res) => {
  const offer = await OfferLetter.findOne({ candidateEmail: req.user.email })
    .sort({ offerDate: -1, createdAt: -1 })
    .select('-accessTokenHash -digitalSignature.signatureBase64')
    .populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(404, 'No offer letter is associated with your account');

  const { salaryAssignmentId, ...rest } = offer.toObject();
  res.status(200).json({ success: true, offer: rest, compensation: presentBreakdown(salaryAssignmentId) });
});

/** GET /api/offers/mine/pdf — stream the caller's own (signed, if available) offer PDF. */
export const downloadMyOfferPdf = asyncHandler(async (req, res) => {
  const offer = await OfferLetter.findOne({ candidateEmail: req.user.email }).sort({ offerDate: -1, createdAt: -1 });
  if (!offer) throw new ApiError(404, 'No offer letter found');

  const rel = offer.signedPdfFileUrl || offer.pdfFileUrl;
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Offer PDF is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="offer-${offer._id}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});

/** GET /api/offers?status=&page=&limit= — US 3.3 management matrix. */
export const listOffers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ fullName: rx }, { candidateEmail: rx }, { position: rx }];
  }

  const [data, total] = await Promise.all([
    OfferLetter.find(filter).select('-accessTokenHash').sort({ offerDate: -1 }).skip((page - 1) * limit).limit(limit),
    OfferLetter.countDocuments(filter)
  ]);
  res.status(200).json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

/** GET /api/offers/:id */
export const getOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id)
    .select('-accessTokenHash')
    .populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(404, 'Offer not found');
  res.status(200).json({ success: true, offer });
});

/**
 * PATCH /api/offers/:id/status — US 3.3 manual state controls.
 * Body: { status: sent|pending|accepted|declined }
 */
export const updateOfferStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');
  offer.status = req.body.status;
  await offer.save();
  res.status(200).json({ success: true, message: `Offer marked ${offer.status}`, offer });
});

/**
 * POST /api/offers/:id/approve — US 5.4 approval gate.
 * HR/Admin approves a candidate-signed offer. Only valid once the candidate has
 * e-signed (status 'signed'). On approval the offer is flipped to 'accepted' and
 * the backing candidate is provisioned into an active employee — assigning an
 * employee ID and emailing login credentials.
 */
export const approveOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id).populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(404, 'Offer not found');

  if (offer.status === 'accepted') throw new ApiError(400, 'Offer already approved');
  if (offer.status === 'declined') throw new ApiError(400, 'Cannot approve a declined offer');
  if (offer.status !== 'signed') throw new ApiError(400, 'Offer has not been signed by the candidate yet');

  await acceptOfferForProvisioning(offer, { approvedBy: req.user._id });

  // Provision the candidate into an active employee and email credentials.
  let provisioning = null;
  const userId = offer.salaryAssignmentId?.userId;
  if (userId) {
    const user = await User.findById(userId);
    if (user) provisioning = await provisionEmployee(user, { offer });
  }

  await logActivity({
    actor: req.user,
    action: 'offer.accept',
    entityType: 'OfferLetter',
    entityId: offer._id,
    message: `${offer.fullName} offer approved${provisioning?.employeeId ? ` (${provisioning.employeeId})` : ''}`
  });

  res.status(200).json({
    success: true,
    message: `Offer approved — login credentials emailed to ${offer.candidateEmail}`,
    offer,
    employeeId: provisioning?.employeeId || null,
    credentialsEmailedTo: offer.candidateEmail,
    ...(exposeToken() && provisioning ? { tempPassword: provisioning.tempPassword } : {})
  });
});

/**
 * POST /api/offers/:id/appointment-letter
 * Generate Appointment Letter from Template Setup default, issue as EmployeeDocument,
 * and email the PDF to the employee. Only for accepted offers.
 */
export const generateAppointmentLetter = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id).populate({ path: 'salaryAssignmentId' });
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status !== 'accepted') {
    throw new ApiError(400, 'Appointment letter can only be generated for accepted offers');
  }

  let user = null;
  const userId = offer.salaryAssignmentId?.userId;
  if (userId) user = await User.findById(userId);
  if (!user) {
    user = await User.findOne({ email: offer.candidateEmail, companyId: offer.companyId });
  }
  if (!user) throw new ApiError(404, 'Employee account not found for this offer');

  // Reporting area: explicit body → offer Job Location → employee workLocation → omit line.
  const reportingArea = String(
    req.body?.location || req.body?.reportingArea || offer.location || user.employeeDetails?.workLocation || ''
  ).trim();

  const result = await issueAndEmailAppointmentLetter({
    user,
    issuedBy: req.user,
    designation: offer.position || user.employeeDetails?.designation,
    effectiveDate: offer.joiningDate || user.employeeDetails?.dateOfJoining || new Date(),
    department: offer.department || user.employeeDetails?.department,
    companyId: offer.companyId,
    annualCTCPaisa: offer.salaryAssignmentId?.annualCTC,
    location: reportingArea,
    // Fallback when user profile still has placeholder phone/address.
    offerPhone: offer.phone || '',
    offerAddress: offer.city || '',
    queueEmail: true
  });

  await logActivity({
    actor: req.user,
    action: 'offer.appointment_letter',
    entityType: 'OfferLetter',
    entityId: offer._id,
    message: `Appointment letter issued to ${offer.fullName} (${offer.candidateEmail})`
  });

  const mailed = result.email?.queued
    ? ` — email queued to ${offer.candidateEmail}`
    : result.email?.delivered
      ? ` and emailed to ${offer.candidateEmail}`
      : ` (email ${result.email?.mode || 'stub'} — check SMTP if not delivered)`;

  res.status(201).json({
    success: true,
    message: `${result.title} generated${mailed}`,
    document: result.document,
    email: result.email
  });
});

/** GET /api/offers/:id/pdf — stream the (signed, if available) offer PDF. */
export const downloadOfferPdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');

  const rel = offer.signedPdfFileUrl || offer.pdfFileUrl;
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Offer PDF is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="offer-${offer._id}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});

const unlinkQuiet = (rel) => {
  if (!rel) return;
  try {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch { /* ignore */ }
};

/**
 * POST /api/offers/:id/regenerate — rebuild the offer PDF from frozen salary + current letter template.
 * Remints the magic link. Clears any prior e-signature. Does not email (use resend afterward).
 */
export const regenerateOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status === 'accepted') throw new ApiError(400, 'Cannot regenerate an accepted offer');

  const assignment = await EmployeeSalaryAssignment.findById(offer.salaryAssignmentId);
  if (!assignment?.frozenMonthlyBreakdown) {
    throw new ApiError(400, 'Salary assignment missing — cannot regenerate offer PDF');
  }

  // Re-freeze from the current salary template so Gross reconciles to monthly CTC
  // (fixes older freezes where fixed/% earnings left a CTC gap ≈ PF).
  const template = await SalaryStructureTemplate.findById(assignment.templateId);
  if (template) {
    const breakdown = computeBreakdown(template, assignment.annualCTC);
    assignment.frozenMonthlyBreakdown = breakdown;
    await assignment.save();
  }

  const company = await Company.findById(offer.companyId);
  const letterTpl = await resolveDefaultLetterTemplate('OfferLetter');
  const previousPdf = offer.pdfFileUrl;
  const previousSigned = offer.signedPdfFileUrl;

  const { pdfFileUrl, acceptancePlacement } = await generateOfferLetterPdf({
    fullName: offer.fullName,
    position: offer.position,
    department: offer.department,
    offerDate: offer.offerDate,
    joiningDate: offer.joiningDate,
    breakdown: assignment.frozenMonthlyBreakdown,
    annualCTC: assignment.annualCTC,
    company,
    candidateEmail: offer.candidateEmail,
    phone: offer.phone || '',
    city: offer.city || '',
    location: offer.location || '',
    bodyParagraphs: letterTpl?.bodyParagraphs || null
  });

  const { raw, hash } = generateToken();
  offer.pdfFileUrl = pdfFileUrl;
  offer.acceptancePlacement = acceptancePlacement;
  offer.signedPdfFileUrl = null;
  offer.digitalSignature = {
    signatureBase64: null,
    signedAt: null,
    ipAddress: null,
    verificationToken: null
  };
  offer.accessTokenHash = hash;
  offer.accessTokenExpires = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  // Signed offers fall back to pending so the candidate can re-sign the new PDF.
  if (offer.status === 'signed') offer.status = 'pending';
  await offer.save();

  if (previousPdf && previousPdf !== pdfFileUrl) unlinkQuiet(previousPdf);
  if (previousSigned) unlinkQuiet(previousSigned);

  const offerUrl = `${clientOrigin()}/offer/${raw}`;
  const emailPreview = renderOfferEmail(letterTpl, buildOfferEmailFields({
    fullName: offer.fullName,
    position: offer.position,
    department: offer.department,
    joiningDate: offer.joiningDate,
    offerDate: offer.offerDate,
    location: offer.location,
    company,
    annualCTCPaisa: assignment.annualCTC,
    offerUrl
  }));

  res.status(200).json({
    success: true,
    message: 'Offer PDF regenerated',
    offer,
    emailPreview,
    ...(exposeToken() ? { accessToken: raw, offerUrl } : {})
  });
});

/** DELETE /api/offers/:id — remove offer and its PDF files. */
export const deleteOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status === 'accepted') {
    throw new ApiError(400, 'Cannot delete an accepted offer — employee is already provisioned');
  }

  unlinkQuiet(offer.pdfFileUrl);
  unlinkQuiet(offer.signedPdfFileUrl);
  await offer.deleteOne();

  res.status(200).json({ success: true, message: 'Offer deleted' });
});

/** POST /api/offers/:id/resend — US 3.3, re-mint the magic link and re-email with PDF. */
export const resendOffer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid offer id');
  const offer = await OfferLetter.findById(req.params.id);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status === 'accepted') throw new ApiError(400, 'Offer already accepted');

  const { raw, hash } = generateToken();
  offer.accessTokenHash = hash;
  offer.accessTokenExpires = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  if (offer.status === 'pending') offer.status = 'sent';
  await offer.save();

  const offerUrl = `${clientOrigin()}/offer/${raw}`;
  const company = await Company.findById(offer.companyId);
  const letterTpl = await resolveDefaultLetterTemplate('OfferLetter');
  const assignment = await EmployeeSalaryAssignment.findById(offer.salaryAssignmentId);
  const emailPreview = renderOfferEmail(letterTpl, buildOfferEmailFields({
    fullName: offer.fullName,
    position: offer.position,
    department: offer.department,
    joiningDate: offer.joiningDate,
    offerDate: offer.offerDate,
    location: offer.location,
    company,
    annualCTCPaisa: assignment?.annualCTC,
    offerUrl
  }));

  const email = await queueMailJob(() => deliverOfferEmail({
    offer,
    fullName: offer.fullName,
    offerUrl,
    subject: emailPreview.subject,
    body: emailPreview.body
  }));

  res.status(200).json({
    success: true,
    message: email?.queued ? 'Offer reminder queued for delivery' : 'Offer reminder sent',
    email,
    emailPreview,
    ...(exposeToken() ? { accessToken: raw, offerUrl } : {})
  });
});
