import mongoose from 'mongoose';
import Department, { DEFAULT_DEPARTMENTS } from '../models/Department.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** Ensure default departments exist for the current tenant (idempotent; adds any missing names). */
export const ensureDefaultDepartments = async () => {
  const existing = await Department.find({}).select('name');
  const have = new Set(existing.map((d) => String(d.name).toLowerCase()));
  const missing = DEFAULT_DEPARTMENTS
    .map((name, i) => ({ name, sortOrder: i, active: true }))
    .filter((row) => !have.has(row.name.toLowerCase()));
  if (!missing.length) return;
  await Department.insertMany(missing, { ordered: false }).catch(() => { /* ignore duplicate races */ });
};

/** GET /api/departments — active by default; ?all=true includes inactive. */
export const listDepartments = asyncHandler(async (req, res) => {
  await ensureDefaultDepartments();
  const filter = req.query.all === 'true' ? {} : { active: true };
  const data = await Department.find(filter).sort({ sortOrder: 1, name: 1 });
  res.status(200).json({ success: true, data });
});

/** POST /api/departments — { name } */
export const createDepartment = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError(400, 'name is required');
  const existing = await Department.findOne({
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  });
  if (existing) {
    if (!existing.active) {
      existing.active = true;
      await existing.save();
      return res.status(200).json({ success: true, message: 'Department restored', department: existing });
    }
    throw new ApiError(409, 'A department with this name already exists');
  }
  const maxOrder = await Department.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  const department = await Department.create({
    name,
    sortOrder: (maxOrder?.sortOrder || 0) + 1,
    active: true
  });
  res.status(201).json({ success: true, message: 'Department created', department });
});

/** PUT /api/departments/:id */
export const updateDepartment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid department id');
  const department = await Department.findById(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new ApiError(400, 'name is required');
    department.name = name;
  }
  if (req.body.active !== undefined) department.active = Boolean(req.body.active);
  if (req.body.sortOrder !== undefined) department.sortOrder = Number(req.body.sortOrder) || 0;
  await department.save();
  res.status(200).json({ success: true, message: 'Department updated', department });
});

/** DELETE /api/departments/:id — soft-deactivate. */
export const deleteDepartment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid department id');
  const department = await Department.findById(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');
  department.active = false;
  await department.save();
  res.status(200).json({ success: true, message: 'Department removed' });
});
