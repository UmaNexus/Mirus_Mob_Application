import mongoose from 'mongoose';
import JobRole from '../models/JobRole.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * GET /api/job-roles — active roles by default; ?all=true includes inactive.
 * READ-ONLY: this path never creates, renames or deletes JobRoles; it only lists the company's
 * existing roles (the Admin role dropdown assigns one of these to `employeeDetails.jobRole`).
 */
export const listJobRoles = asyncHandler(async (req, res) => {
  const filter = req.query.all === 'true' ? {} : { active: true };
  const data = await JobRole.find(filter).sort({ sortOrder: 1, name: 1 });
  res.status(200).json({ success: true, data });
});

/** POST /api/job-roles — { name } */
export const createJobRole = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError(400, 'name is required');
  const existing = await JobRole.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (existing) {
    if (!existing.active) {
      existing.active = true;
      await existing.save();
      return res.status(200).json({ success: true, message: 'Role restored', role: existing });
    }
    throw new ApiError(409, 'A role with this name already exists');
  }
  const maxOrder = await JobRole.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  const role = await JobRole.create({
    name,
    sortOrder: (maxOrder?.sortOrder || 0) + 1,
    active: true
  });
  res.status(201).json({ success: true, message: 'Role created', role });
});

/** PUT /api/job-roles/:id */
export const updateJobRole = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid role id');
  const role = await JobRole.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new ApiError(400, 'name is required');
    role.name = name;
  }
  if (req.body.active !== undefined) role.active = Boolean(req.body.active);
  if (req.body.sortOrder !== undefined) role.sortOrder = Number(req.body.sortOrder) || 0;
  await role.save();
  res.status(200).json({ success: true, message: 'Role updated', role });
});

/** DELETE /api/job-roles/:id — soft-deactivate. */
export const deleteJobRole = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid role id');
  const role = await JobRole.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');
  role.active = false;
  await role.save();
  res.status(200).json({ success: true, message: 'Role removed' });
});
