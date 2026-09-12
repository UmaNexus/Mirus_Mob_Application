import mongoose from 'mongoose';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Block deactivate/delete when any non-deleted employee still has the template
 * assigned (active or inactive). Soft-deleted users are ignored.
 */
const assertTemplateNotInUse = async (templateId, action = 'deactivate') => {
  const assignments = await EmployeeSalaryAssignment.find({ templateId }).select('userId').lean();
  if (!assignments.length) return;

  const userIds = assignments.map((a) => a.userId);
  const employees = await User.find({
    _id: { $in: userIds },
    deletedAt: null
  }).select('personalDetails.firstName personalDetails.lastName email isActive employeeDetails.employeeId').lean();

  if (!employees.length) return;

  const activeCount = employees.filter((e) => e.isActive).length;
  const samples = employees.slice(0, 3).map((e) => {
    const name = [e.personalDetails?.firstName, e.personalDetails?.lastName].filter(Boolean).join(' ').trim();
    const empId = e.employeeDetails?.employeeId;
    return empId ? `${name || e.email} (${empId})` : (name || e.email);
  });
  const more = employees.length > samples.length ? ` and ${employees.length - samples.length} more` : '';
  const activeNote = activeCount
    ? ` including ${activeCount} active`
    : '';

  throw new ApiError(
    409,
    `Cannot ${action} this salary template because it is assigned to ${employees.length} employee(s)${activeNote}: ${samples.join(', ')}${more}. Reassign those employees first.`
  );
};

/** Balance of CTC belongs only in earnings — never persist it under deductions. */
const sanitizeDeductions = (rows = []) =>
  (Array.isArray(rows) ? rows : []).filter((f) => f?.calculationType !== 'balance_of_ctc');

/**
 * POST /api/salary-templates
 * US 4.1 — persist a reusable salary calculation template.
 * Monetary `valueFactor`s for fixed fields are expected in paisa.
 */
export const createTemplate = asyncHandler(async (req, res) => {
  const { name, description, earningsStructure, deductionsStructure } = req.body;
  const template = await SalaryStructureTemplate.create({
    name,
    description,
    earningsStructure: earningsStructure || [],
    deductionsStructure: sanitizeDeductions(deductionsStructure)
  });
  res.status(201).json({ success: true, message: 'Template created', template });
});

/** GET /api/salary-templates?activeOnly=true */
export const listTemplates = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.activeOnly === 'true') filter.isActive = true;
  const templates = await SalaryStructureTemplate.find(filter).sort({ updatedAt: -1 });
  res.status(200).json({ success: true, data: templates });
});

/** GET /api/salary-templates/:id */
export const getTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await SalaryStructureTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');
  res.status(200).json({ success: true, template });
});

/** PUT /api/salary-templates/:id */
export const updateTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await SalaryStructureTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');

  const deactivating = req.body.isActive === false && template.isActive !== false;
  if (deactivating) {
    await assertTemplateNotInUse(template._id, 'deactivate');
  }

  ['name', 'description', 'earningsStructure', 'deductionsStructure', 'isActive'].forEach((k) => {
    if (req.body[k] !== undefined) template[k] = req.body[k];
  });
  if (req.body.deductionsStructure !== undefined) {
    template.deductionsStructure = sanitizeDeductions(req.body.deductionsStructure);
  }
  await template.save();
  res.status(200).json({ success: true, message: 'Template updated', template });
});

/**
 * DELETE /api/salary-templates/:id
 * Soft-deactivates the template when no employees still reference it.
 */
export const deactivateTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await SalaryStructureTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');
  if (!template.isActive) {
    return res.status(200).json({ success: true, message: 'Template already deactivated' });
  }

  await assertTemplateNotInUse(template._id, 'deactivate');

  template.isActive = false;
  await template.save();
  res.status(200).json({ success: true, message: 'Template deactivated' });
});

/**
 * DELETE /api/salary-templates/:id/permanent
 * Hard-delete an inactive template. Active templates must be deactivated first.
 */
export const deleteInactiveTemplate = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid template id');
  const template = await SalaryStructureTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');
  if (template.isActive) {
    throw new ApiError(400, 'Deactivate the salary template before deleting it permanently');
  }

  await assertTemplateNotInUse(template._id, 'delete');

  await template.deleteOne();
  res.status(200).json({ success: true, message: 'Inactive salary template deleted' });
});
