import Company from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { provisionTenant } from '../services/tenantService.js';

/**
 * POST /api/tenants — superadmin provisions a new company + its first admin.
 * Body: { name, slug, adminEmail, adminPassword, adminFirstName?, adminLastName? }
 */
export const createTenant = asyncHandler(async (req, res) => {
  const { name, slug, adminEmail, adminPassword } = req.body;
  if (!name || !slug || !adminEmail || !adminPassword) {
    throw new ApiError(400, 'name, slug, adminEmail and adminPassword are required');
  }
  const { company, admin } = await provisionTenant(req.body);
  res.status(201).json({
    success: true,
    message: `Company "${company.name}" created`,
    company: { id: company._id, name: company.name, slug: company.slug },
    admin: { id: admin._id, email: admin.email }
  });
});

/** GET /api/tenants — superadmin lists all companies (not tenant-scoped). */
export const listTenants = asyncHandler(async (req, res) => {
  const companies = await Company.find().sort({ createdAt: -1 }).select('name slug status createdAt');
  res.status(200).json({ success: true, data: companies });
});
