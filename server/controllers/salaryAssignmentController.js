import mongoose from 'mongoose';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { computeBreakdown } from '../utils/salaryEngine.js';
import { rupeesToPaisa } from '../utils/money.js';

/**
 * POST /api/salary-assignments
 * Assign a template + annual CTC to a user and freeze the computed monthly
 * breakdown. One assignment per user (upsert).
 *
 * Body: { userId, templateId, annualCTC }  — annualCTC in RUPEES.
 */
export const assignSalary = asyncHandler(async (req, res) => {
  const { userId, templateId, annualCTC } = req.body;

  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(templateId)) {
    throw new ApiError(400, 'Invalid userId or templateId');
  }

  const [user, template] = await Promise.all([
    User.findById(userId),
    SalaryStructureTemplate.findById(templateId)
  ]);
  if (!user) throw new ApiError(404, 'User not found');
  if (!template) throw new ApiError(404, 'Salary template not found');

  const annualCTCPaisa = rupeesToPaisa(annualCTC);
  const breakdown = computeBreakdown(template, annualCTCPaisa);

  const assignment = await EmployeeSalaryAssignment.findOneAndUpdate(
    { userId },
    { userId, templateId, annualCTC: annualCTCPaisa, frozenMonthlyBreakdown: breakdown },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  res.status(201).json({ success: true, message: 'Salary assigned', assignment });
});

/** GET /api/salary-assignments/user/:userId */
export const getAssignmentByUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) throw new ApiError(400, 'Invalid user id');
  const assignment = await EmployeeSalaryAssignment.findOne({ userId: req.params.userId })
    .populate('templateId', 'name description');
  if (!assignment) throw new ApiError(404, 'No salary assignment found for this user');
  res.status(200).json({ success: true, assignment });
});
