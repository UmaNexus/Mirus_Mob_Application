import mongoose from 'mongoose';
import SecondarySale from '../models/SecondarySale.js';
import Stockist from '../models/Stockist.js';
import User from '../models/User.js';
import { dispatchNotification } from '../services/notificationService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { rupeesToPaisa } from '../utils/money.js';
import { hasCompanyWideFieldOpsAccess, buildReportingSubtreeIds } from '../middleware/fieldForceAuth.js';

/** Verify a referenced stockistId belongs to the caller (ownership). */
const assertOwnStockist = async (stockistId, userId) => {
  if (!stockistId) return;
  const stockist = await Stockist.findOne({ _id: stockistId, userId });
  if (!stockist) throw new ApiError(400, 'stockistId not found or not owned by you');
};

/** GET /api/secondary-sales — the caller's own batches (ownership). */
export const listMySecondarySales = asyncHandler(async (req, res) => {
  const sales = await SecondarySale.find({ userId: req.user._id })
    .populate('stockistId', 'name')
    .sort({ expiryDate: 1 });
  res.status(200).json({ success: true, data: sales });
});

/** GET /api/secondary-sales/alerts — the caller's own batches expiring within 30 days. */
export const listExpiryAlerts = asyncHandler(async (req, res) => {
  const in30Days = new Date(Date.now() + 30 * 86400000);
  const sales = await SecondarySale.find({
    userId: req.user._id,
    expiryDate: { $ne: null, $lte: in30Days }
  }).sort({ expiryDate: 1 });
  res.status(200).json({ success: true, data: sales });
});

/** POST /api/secondary-sales — a BDM adds a batch. */
export const createSecondarySale = asyncHandler(async (req, res) => {
  const { stockistId, productName, batchNumber, expiryDate, quantity, value } = req.body;
  await assertOwnStockist(stockistId, req.user._id);

  const sale = await SecondarySale.create({
    userId: req.user._id,
    stockistId: stockistId || null,
    productName, batchNumber,
    expiryDate: expiryDate || null,
    quantity: quantity || 0,
    value: value != null ? rupeesToPaisa(value) : 0
  });

  const submitter = await User.findById(req.user._id).select('personalDetails employeeDetails.reportingManagerId');
  const managerId = submitter?.employeeDetails?.reportingManagerId;
  const employeeName = [submitter?.personalDetails?.firstName, submitter?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
  const formattedVal = value != null ? (rupeesToPaisa(value) / 100).toLocaleString('en-IN') : '0';

  if (managerId) {
    dispatchNotification({
      companyId: req.user.companyId,
      recipientIds: [managerId],
      senderId: req.user._id,
      module: 'secondary_sales',
      eventId: 'SECONDARY_SALES_SUBMITTED',
      title: 'Secondary Sales Logged',
      body: `${employeeName} logged secondary sale for ${productName} (₹${formattedVal})`,
      priority: 'low',
      deepLink: 'mirus://bdm/secondary-sales',
      entityType: 'SecondarySale',
      entityId: sale._id,
      data: { screen: 'SecondarySalesScreen', saleId: sale._id }
    }).catch(() => {});
  }

  res.status(201).json({ success: true, message: 'Secondary sale recorded', sale });
});

/** PATCH /api/secondary-sales/:id — a BDM edits their own batch (ownership). */
export const updateSecondarySale = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid secondary sale id');
  const sale = await SecondarySale.findById(req.params.id);
  if (!sale) throw new ApiError(404, 'Secondary sale not found');
  if (String(sale.userId) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only edit your own secondary sale records');
  }

  const { stockistId, productName, batchNumber, expiryDate, quantity, value } = req.body;
  if (stockistId !== undefined) {
    await assertOwnStockist(stockistId, req.user._id);
    sale.stockistId = stockistId || null;
  }
  if (productName !== undefined) sale.productName = productName;
  if (batchNumber !== undefined) sale.batchNumber = batchNumber;
  if (expiryDate !== undefined) sale.expiryDate = expiryDate || null;
  if (quantity !== undefined) sale.quantity = quantity;
  if (value !== undefined) sale.value = rupeesToPaisa(value);
  await sale.save();

  res.status(200).json({ success: true, message: 'Secondary sale updated', sale });
});

/** GET /api/secondary-sales/team — ASM+ read-only, reporting-subtree scoped. */
export const listTeamSecondarySales = asyncHandler(async (req, res) => {
  const filter = {};
  if (!hasCompanyWideFieldOpsAccess(req.user)) {
    const subtree = await buildReportingSubtreeIds(req.user._id);
    filter.userId = { $in: [...subtree] };
  } else if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new ApiError(400, 'Invalid userId');
    filter.userId = req.query.userId;
  }

  const sales = await SecondarySale.find(filter)
    .populate('userId', 'personalDetails.firstName personalDetails.lastName')
    .populate('stockistId', 'name')
    .sort({ expiryDate: 1 })
    .limit(2000);
  res.status(200).json({ success: true, data: sales });
});
