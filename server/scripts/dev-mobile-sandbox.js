/**
 * Ephemeral local sandbox for testing the mobile app end-to-end.
 *
 * Spins up an in-memory MongoDB (mongodb-memory-server, already a test
 * dependency) and the real Express app against it — NEVER a real MONGO_URI,
 * so this can never touch production or any shared database. All data
 * vanishes when the process exits. This is intentionally separate from
 * `npm run db:seed` (which is destructive and drops the connected database)
 * and from `db:seed:admin`/`db:setup` (which are safe but operate against
 * whatever real MONGO_URI is configured) — this script never reads
 * MONGO_URI at all.
 *
 * Creates exactly one company and three field-force test users so the
 * mobile app's BDM screens can be exercised against a live backend:
 *   - admin@sandbox.test / Sandbox123!  (role: admin)
 *   - asm@sandbox.test   / Sandbox123!  (JobRole: Area sales manager)
 *   - bdm@sandbox.test   / Sandbox123!  (JobRole: Business development manager, reports to the ASM)
 * plus one doctor pre-assigned to the BDM so DCR/MTP screens have something
 * real to show immediately.
 *
 * Run with: node scripts/dev-mobile-sandbox.js
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { DEV_PERSONA_ROLE_NAMES, ensureJobRoleId } from './lib/devJobRoles.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_sandbox_jwt_secret';
process.env.NODE_ENV = 'development';
process.env.PORT = process.env.PORT || '5050';
// Allow the Expo web dev server's default port in addition to the web
// client's — a real mobile app sends no Origin header at all and is
// unaffected by this; this only matters for testing via `expo start --web`.
process.env.CLIENT_ORIGINS = process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://localhost:8081,http://localhost:19006';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();

const { default: app } = await import('../app.js');
const { default: Company } = await import('../models/Company.js');
const { default: User } = await import('../models/User.js');
const { default: Doctor } = await import('../models/Doctor.js');
const { runWithStore } = await import('../utils/tenantContext.js');

await mongoose.connect(process.env.MONGO_URI);

const company = await Company.create({ name: 'Sandbox Co', slug: 'sandbox', status: 'active' });

const baseUser = (overrides) => ({
  companyId: company._id,
  password: 'Sandbox123!',
  isActive: true,
  personalDetails: { firstName: overrides.firstName, lastName: overrides.lastName, dateOfBirth: new Date('1990-01-01'), gender: 'Male' },
  contactInfo: {
    personalMobile: '9876543210',
    emergencyContactName: 'Kin',
    emergencyContactRelation: 'Sibling',
    emergencyContactPhone: '9876500000',
    presentAddress: { street: '1 St', city: 'Pune', state: 'Maharashtra', country: 'India', zipCode: '411001' },
    permanentAddress: { street: '1 St', city: 'Pune', state: 'Maharashtra', country: 'India', zipCode: '411001' }
  },
  ...overrides
});

await runWithStore({ companyId: String(company._id), role: 'admin', authed: true }, async () => {
  const admin = await User.create(baseUser({ email: 'admin@sandbox.test', role: 'admin', firstName: 'Sandbox', lastName: 'Admin' }));
  const asm = await User.create(baseUser({
    email: 'asm@sandbox.test', role: 'employee', firstName: 'Amit', lastName: 'Shah',
    employeeDetails: { jobRole: await ensureJobRoleId(company._id, DEV_PERSONA_ROLE_NAMES.ASM) }
  }));
  const bdm = await User.create(baseUser({
    email: 'bdm@sandbox.test', role: 'employee', firstName: 'Priya', lastName: 'Desai',
    employeeDetails: { jobRole: await ensureJobRoleId(company._id, DEV_PERSONA_ROLE_NAMES.BDM), reportingManagerId: asm._id }
  }));
  await Doctor.create({
    companyId: company._id, name: 'Dr. Sanjay Mehta', speciality: 'Cardiologist', area: 'Koregaon Park',
    phone: '9820011234', assignedTo: bdm._id, createdBy: asm._id
  });
  console.log('Sandbox users:');
  console.log('  admin@sandbox.test / Sandbox123! (admin)');
  console.log('  asm@sandbox.test   / Sandbox123! (ASM, manages the BDM below)');
  console.log('  bdm@sandbox.test   / Sandbox123! (BDM, 1 doctor pre-assigned)');
  console.log(`Company code: ${company.slug}`);
  void admin;
});

app.listen(process.env.PORT, () => {
  console.log(`Sandbox API listening on http://localhost:${process.env.PORT}`);
  console.log('This is an in-memory database — all data is lost when this process exits.');
});
