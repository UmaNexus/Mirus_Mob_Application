import mongoose from 'mongoose';
import Stockist from '../models/Stockist.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { rupeesToPaisa } from '../utils/money.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';

/** GET /api/stockists — the caller's own stockists (ownership). */
export const listMyStockists = asyncHandler(async (req, res) => {
  const stockists = await Stockist.find({ userId: req.user._id }).sort({ name: 1 });
  res.status(200).json({ success: true, data: stockists });
});

/** POST /api/stockists — a BDM adds their own stockist. */
export const createStockist = asyncHandler(async (req, res) => {
  const { name, area, lastOrderAmount, lastOrderDate, status } = req.body;
  const stockist = await Stockist.create({
    userId: req.user._id,
    name, area,
    lastOrderAmount: lastOrderAmount != null ? rupeesToPaisa(lastOrderAmount) : 0,
    lastOrderDate: lastOrderDate || null,
    status: status || 'Active'
  });
  res.status(201).json({ success: true, message: 'Stockist added', stockist });
});

/** PATCH /api/stockists/:id — a BDM edits their own stockist (ownership). */
export const updateStockist = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid stockist id');
  const stockist = await Stockist.findById(req.params.id);
  if (!stockist) throw new ApiError(404, 'Stockist not found');
  if (String(stockist.userId) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only edit your own stockists');
  }

  const { name, area, lastOrderAmount, lastOrderDate, status } = req.body;
  if (name !== undefined) stockist.name = name;
  if (area !== undefined) stockist.area = area;
  if (lastOrderAmount !== undefined) stockist.lastOrderAmount = rupeesToPaisa(lastOrderAmount);
  if (lastOrderDate !== undefined) stockist.lastOrderDate = lastOrderDate || null;
  if (status !== undefined) stockist.status = status;
  await stockist.save();

  res.status(200).json({ success: true, message: 'Stockist updated', stockist });
});

/** GET /api/stockists/team — ASM+ read-only, reporting-subtree scoped. */
export const listTeamStockists = asyncHandler(async (req, res) => {
  const filter = {};
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  } else if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }

  const stockists = await Stockist.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName employeeDetails.fieldForce')
    .sort({ name: 1 })
    .limit(2000);
  res.status(200).json({ success: true, data: stockists });
});
