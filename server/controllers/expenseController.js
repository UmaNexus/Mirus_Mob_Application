import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { rupeesToPaisa } from '../utils/money.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds, canAccessFieldOpsUser } from '../middleware/fieldForceAuth.js';

/**
 * POST /api/expenses — a BDM submits an expense claim, optionally with a
 * receipt. `approverId` is computed server-side from the claimant's own
 * `employeeDetails.reportingManagerId` at submission time (same strict-
 * hierarchy pattern as MTP) — never chosen by the mobile client.
 */
export const createExpense = asyncHandler(async (req, res) => {
  const { category, date, amount, stationType, from, to, modeOfTravel } = req.body;

  const submitter = await User.findById(req.user._id).select('employeeDetails.reportingManagerId');
  const approverId = submitter?.employeeDetails?.reportingManagerId || null;

  const expense = await Expense.create({
    userId: req.user._id,
    category,
    date: new Date(date),
    amount: rupeesToPaisa(amount),
    stationType: stationType || null,
    from, to, modeOfTravel,
    approverId,
    receiptFileUrl: req.file ? `uploads/receipts/${req.file.filename}` : null
  });

  await logActivity({
    actor: req.user, action: 'expense.create', entityType: 'Expense', entityId: expense._id,
    message: `Expense claim (${category}) submitted`
  });

  res.status(201).json({ success: true, message: 'Expense submitted', expense });
});

/** GET /api/expenses — the caller's own claims (ownership). */
export const listMyExpenses = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) {
      const fromStr = req.query.from.length === 10 ? `${req.query.from}T00:00:00.000Z` : req.query.from;
      const fromDate = new Date(fromStr);
      if (!isNaN(fromDate.getTime())) filter.date.$gte = fromDate;
    }
    if (req.query.to) {
      const toStr = req.query.to.length === 10 ? `${req.query.to}T23:59:59.999Z` : req.query.to;
      const toDate = new Date(toStr);
      if (!isNaN(toDate.getTime())) filter.date.$lte = toDate;
    }
  }
  const expenses = await Expense.find(filter).sort({ date: -1 });
  res.status(200).json({ success: true, data: expenses });
});

/** GET /api/expenses/team — ASM+ read-only, reporting-subtree scoped. */
export const listTeamExpenses = asyncHandler(async (req, res) => {
  const filter = {};
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  } else if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) {
      const fromStr = req.query.from.length === 10 ? `${req.query.from}T00:00:00.000Z` : req.query.from;
      const fromDate = new Date(fromStr);
      if (!isNaN(fromDate.getTime())) filter.date.$gte = fromDate;
    }
    if (req.query.to) {
      const toStr = req.query.to.length === 10 ? `${req.query.to}T23:59:59.999Z` : req.query.to;
      const toDate = new Date(toStr);
      if (!isNaN(toDate.getTime())) filter.date.$lte = toDate;
    }
  }

  const expenses = await Expense.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ date: -1 })
    .limit(2000);
  res.status(200).json({ success: true, data: expenses });
});

/** GET /api/expenses/pending — an approver's inbox (approverId=self or submitter in caller's reporting subtree). */
export const listPendingApprovals = asyncHandler(async (req, res) => {
  const filter = { status: 'pending' };
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.$or = [
      { approverId: req.user._id },
      { userId: { $in: [...subtree] } }
    ];
  }
  const expenses = await Expense.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ createdAt: 1 });
  res.status(200).json({ success: true, data: expenses });
});

/**
 * PATCH /api/expenses/:id/decision — approve/reject. Either the designated
 * approver stamped at submission or any manager above the claimant in the
 * reporting chain (or admin/superadmin) may decide it.
 */
export const decideExpense = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid expense id');
  const { status, note } = req.body;
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status !== 'pending') throw new ApiError(400, `Expense is already ${expense.status}`);

  const isDesignatedApprover = expense.approverId && String(expense.approverId) === String(req.user._id);
  const isAuthorizedManager = await canAccessFieldOpsUser(req.user, expense.userId);
  if (!isDesignatedApprover && !isAuthorizedManager && !hasCompanyWideFieldOpsAccess(req.user)) {
    throw new ApiError(403, 'Only the assigned approver or authorized manager may decide this expense');
  }

  expense.status = status;
  expense.approverId = req.user._id;
  expense.decidedAt = new Date();
  expense.decisionNote = note || '';
  await expense.save();

  await logActivity({
    actor: req.user, action: `expense.${status}`, entityType: 'Expense', entityId: expense._id,
    message: `Expense claim ${status}`
  });

  res.status(200).json({ success: true, message: `Expense ${status}`, expense });
});

/** GET /api/expenses/:id/receipt — stream the receipt file (owner or authorized manager only). */
export const streamReceipt = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid expense id');
  const expense = await Expense.findById(req.params.id);
  if (!expense || !expense.receiptFileUrl) throw new ApiError(404, 'Receipt not found');

  const isOwner = String(expense.userId) === String(req.user._id);
  if (!isOwner && !hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    if (!subtree.has(String(expense.userId))) {
      throw new ApiError(403, 'Not permitted to view this receipt');
    }
  }

  const abs = path.resolve(process.cwd(), expense.receiptFileUrl);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Receipt file missing on disk');
  res.setHeader('Content-Disposition', `inline; filename="receipt-${expense._id}${path.extname(abs)}"`);
  fs.createReadStream(abs).pipe(res);
});
