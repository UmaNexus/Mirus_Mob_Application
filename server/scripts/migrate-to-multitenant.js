import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Company, { PLATFORM_SLUG } from '../models/Company.js';
import User from '../models/User.js';
import OfferLetter from '../models/OfferLetter.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import SalarySlip from '../models/SalarySlip.js';

/**
 * One-off, idempotent migration from single-tenant to multi-tenant (Epic T).
 *
 * 1. Ensure a reserved platform tenant + a default "legacy" company exist.
 * 2. Backfill `companyId = legacy._id` on every existing tenant-scoped document
 *    that predates multi-tenancy (i.e. where companyId is missing).
 * 3. Rebuild indexes (drops the old global-unique indexes; builds compound ones
 *    declared on the schemas).
 *
 * Backfill MUST happen before the new compound-unique indexes are relied upon,
 * otherwise null companyId values collide. `syncIndexes()` is called last.
 *
 * Run with: node scripts/migrate-to-multitenant.js
 */
const TENANT_MODELS = [User, OfferLetter, EmployeeSalaryAssignment, SalaryStructureTemplate, SalarySlip];

const run = async () => {
  await connectDB();

  await Company.updateOne(
    { slug: PLATFORM_SLUG },
    { $setOnInsert: { slug: PLATFORM_SLUG, name: 'Platform', status: 'active' } },
    { upsert: true }
  );

  const legacySlug = (process.env.LEGACY_COMPANY_SLUG || 'mirus').toLowerCase();
  const legacyName = process.env.LEGACY_COMPANY_NAME || 'Mirus Med Sciences';
  await Company.updateOne(
    { slug: legacySlug },
    { $setOnInsert: { slug: legacySlug, name: legacyName, status: 'active' } },
    { upsert: true }
  );
  const legacy = await Company.findOne({ slug: legacySlug });

  console.log(`Backfilling existing records into company "${legacySlug}" (${legacy._id})…`);
  for (const Model of TENANT_MODELS) {
    // Bypass the tenantScope plugin (no request context here) by using the raw
    // collection, so documents lacking companyId are actually matched.
    const res = await Model.collection.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId: legacy._id } }
    );
    console.log(`  ${Model.modelName}: ${res.modifiedCount} updated`);
  }

  console.log('Rebuilding indexes (dropping stale global-unique indexes)…');
  for (const Model of TENANT_MODELS) {
    await Model.syncIndexes();
    console.log(`  ${Model.modelName}: indexes synced`);
  }

  console.log('✅ Migration complete.');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('❌ Migration failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
