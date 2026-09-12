import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import CFTemplate, { CF_TEMPLATE_TYPE_LABELS } from '../models/CFTemplate.js';
import CFIssue from '../models/CFIssue.js';
import Company from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fieldsForType, validateCFFields, applyCFFieldDefaults } from '../config/cfFields.js';
import { generateCFAgreementPdf } from '../services/pdfService.js';
import { sendCFAgreement } from '../services/emailService.js';

const presentIssue = (doc) => {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  if (o.fieldValues instanceof Map) o.fieldValues = Object.fromEntries(o.fieldValues);
  o.typeLabel = CF_TEMPLATE_TYPE_LABELS[o.type] || o.type;
  return o;
};

/** GET /api/cf-issues/fields?type=CFAgent — blank fields to collect for a type. */
export const getCFIssueFields = asyncHandler(async (req, res) => {
  const type = req.query.type || req.query.templateType;
  if (!type) throw new ApiError(400, 'type query is required');
  const fields = fieldsForType(type);
  if (!fields?.length) throw new ApiError(400, 'Unknown C&F type');
  res.status(200).json({ success: true, type, fields, typeLabel: CF_TEMPLATE_TYPE_LABELS[type] });
});

/** GET /api/cf-issues — recent sent/generated C&F agreements. */
export const listCFIssues = asyncHandler(async (req, res) => {
  const data = await CFIssue.find().sort({ createdAt: -1 }).limit(100);
  res.status(200).json({ success: true, data: data.map(presentIssue) });
});

/**
 * POST /api/cf-issues
 * Body: { templateId, recipientEmail, fields: { ...blanks } }
 * Loads the C&F template, fills blanks, generates PDF, emails attachment.
 */
export const createAndSendCFIssue = asyncHandler(async (req, res) => {
  const { templateId, fields: rawFields = {} } = req.body;

  if (!mongoose.isValidObjectId(templateId)) throw new ApiError(400, 'Valid templateId is required');
  const template = await CFTemplate.findById(templateId);
  if (!template) throw new ApiError(404, 'C&F template not found');
  if (!template.active) throw new ApiError(400, 'Template is inactive');
  if (!template.fileUrl && !['CFAgent', 'CFDistributor', 'CFWholesaler'].includes(template.type)) {
    throw new ApiError(400, 'Template has no uploaded agreement file');
  }

  const company = await Company.findById(req.user.companyId);
  const fields = applyCFFieldDefaults({ ...rawFields }, company);
  if (req.body.recipientEmail) fields.recipientEmail = req.body.recipientEmail;

  const missing = validateCFFields(template.type, fields);
  if (missing.length) throw new ApiError(400, `Missing required fields: ${missing.join(', ')}`);

  const recipientEmail = String(fields.recipientEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new ApiError(400, 'A valid recipientEmail is required');
  }

  const pdfFileUrl = await generateCFAgreementPdf({
    type: template.type,
    fields,
    company,
    templateTitle: template.name,
    templateFileUrl: template.fileUrl
  });

  const issue = await CFIssue.create({
    companyId: req.user.companyId,
    templateId: template._id,
    type: template.type,
    templateName: template.name,
    recipientEmail,
    partyName: fields.partyName || '',
    fieldValues: fields,
    pdfFileUrl,
    status: 'generated',
    createdBy: req.user._id
  });

  const abs = path.resolve(pdfFileUrl);
  const typeLabel = CF_TEMPLATE_TYPE_LABELS[template.type] || template.name;
  const mailResult = await sendCFAgreement({
    to: recipientEmail,
    partyName: fields.partyName || 'Partner',
    typeLabel,
    brandName: company?.name,
    pdfPath: abs,
    fileName: `${(template.name || 'cf-agreement').replace(/[^\w.-]+/g, '_')}.pdf`
  });

  if (mailResult.delivered) {
    issue.status = 'sent';
    issue.sentAt = new Date();
    issue.emailError = null;
  } else {
    issue.status = mailResult.mode === 'stub' ? 'generated' : 'failed';
    issue.emailError = mailResult.error || (mailResult.mode === 'stub' ? 'SMTP not configured — PDF generated but not emailed' : 'Email failed');
  }
  await issue.save();

  res.status(201).json({
    success: true,
    message: issue.status === 'sent'
      ? `C&F agreement generated and emailed to ${recipientEmail}`
      : `C&F agreement generated. Email not delivered: ${issue.emailError}`,
    issue: presentIssue(issue),
    email: { delivered: Boolean(mailResult.delivered), mode: mailResult.mode, error: mailResult.error || null }
  });
});

/** GET /api/cf-issues/:id/pdf — stream generated PDF. */
export const downloadCFIssuePdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid id');
  const issue = await CFIssue.findById(req.params.id);
  if (!issue) throw new ApiError(404, 'C&F issue not found');
  const abs = path.resolve(issue.pdfFileUrl);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'PDF file missing');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="cf-agreement-${issue._id}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});
