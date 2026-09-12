import mongoose from 'mongoose';
import Asset from '../models/Asset.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';

/** POST /api/assets — register an asset. */
export const createAsset = asyncHandler(async (req, res) => {
  const { tag, type, description, serialNumber, condition } = req.body;
  if (!tag) throw new ApiError(400, 'tag is required');
  const asset = await Asset.create({ tag, type, description, serialNumber, condition });
  await logActivity({
    actor: req.user,
    action: 'asset.create',
    entityType: 'Asset',
    entityId: asset._id,
    message: `Asset ${tag} registered`
  });
  res.status(201).json({ success: true, message: 'Asset registered', asset });
});

/** GET /api/assets?status&assignedTo — asset register. */
export const listAssets = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.assignedTo && mongoose.isValidObjectId(req.query.assignedTo)) filter.assignedTo = req.query.assignedTo;
  const data = await Asset.find(filter).sort({ createdAt: -1 }).limit(1000);
  res.status(200).json({ success: true, data });
});

/** GET /api/assets/mine — assets assigned to the caller. */
export const listMyAssets = asyncHandler(async (req, res) => {
  const data = await Asset.find({ assignedTo: req.user._id, status: 'Assigned' }).sort({ issuedAt: -1 });
  res.status(200).json({ success: true, data });
});

/** POST /api/assets/:id/assign — assign to an employee. Body: { userId } */
export const assignAsset = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid asset id');
  if (!mongoose.isValidObjectId(req.body.userId)) throw new ApiError(400, 'Valid userId is required');
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw new ApiError(404, 'Asset not found');
  if (asset.status === 'Assigned') throw new ApiError(400, 'Asset is already assigned');
  const user = await User.findById(req.body.userId);
  if (!user) throw new ApiError(404, 'Employee not found');

  asset.assignedTo = user._id;
  asset.status = 'Assigned';
  asset.issuedAt = new Date();
  asset.returnedAt = null;
  await asset.save();
  const who = `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`.trim() || user.email;
  await logActivity({
    actor: req.user,
    action: 'asset.assign',
    entityType: 'Asset',
    entityId: asset._id,
    message: `Asset ${asset.tag} assigned to ${who}`
  });
  res.status(200).json({ success: true, message: 'Asset assigned', asset });
});

/** POST /api/assets/:id/return — mark returned. Body: { condition? } */
export const returnAsset = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid asset id');
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw new ApiError(404, 'Asset not found');
  if (asset.status !== 'Assigned') throw new ApiError(400, 'Asset is not currently assigned');

  asset.status = 'Returned';
  asset.returnedAt = new Date();
  asset.assignedTo = null;
  if (req.body.condition) asset.condition = req.body.condition;
  await asset.save();
  res.status(200).json({ success: true, message: 'Asset returned', asset });
});

/** PATCH /api/assets/:id — update fields / retire. */
export const updateAsset = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid asset id');
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw new ApiError(404, 'Asset not found');
  ['tag', 'type', 'description', 'serialNumber', 'condition', 'status'].forEach((k) => {
    if (req.body[k] !== undefined) asset[k] = req.body[k];
  });
  await asset.save();
  res.status(200).json({ success: true, message: 'Asset updated', asset });
});

/** DELETE /api/assets/:id — remove only when not currently assigned. */
export const deleteAsset = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid asset id');
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw new ApiError(404, 'Asset not found');
  if (asset.status === 'Assigned') {
    throw new ApiError(400, 'Return the asset before deleting it');
  }
  const tag = asset.tag;
  await asset.deleteOne();
  await logActivity({
    actor: req.user,
    action: 'asset.delete',
    entityType: 'Asset',
    entityId: req.params.id,
    message: `Asset ${tag} deleted`
  });
  res.status(200).json({ success: true, message: 'Asset deleted' });
});
