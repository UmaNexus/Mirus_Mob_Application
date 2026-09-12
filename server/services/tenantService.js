import Company from '../models/Company.js';
import User from '../models/User.js';
import SalaryStructureTemplate from '../models/SalaryStructureTemplate.js';
import ApiError from '../utils/ApiError.js';

/** A sensible default salary template every new tenant starts with. */
const DEFAULT_TEMPLATE = {
  name: 'Standard',
  description: 'Default salary structure seeded at tenant creation.',
  earningsStructure: [
    { key: 'basic', label: 'Basic Pay', calculationType: 'percentage_of_ctc', valueFactor: 45 },
    { key: 'hra', label: 'HRA', calculationType: 'percentage_of_basic', valueFactor: 40 },
    { key: 'special', label: 'Special Allowance', calculationType: 'balance_of_ctc', valueFactor: 0 }
  ],
  deductionsStructure: [
    { key: 'pf', label: 'Provident Fund', calculationType: 'percentage_of_basic', valueFactor: 12 }
  ]
};

/**
 * Provision a brand-new tenant: creates the Company, its first admin user, and
 * seeds per-tenant defaults. Tenant-scoped documents get `companyId` set
 * explicitly (the caller is typically a superadmin whose own context points at
 * the platform tenant, so we must not rely on context defaulting).
 *
 * @returns {Promise<{ company, admin }>}
 */
export const provisionTenant = async ({ name, slug, adminEmail, adminPassword, adminFirstName, adminLastName }) => {
  const normalizedSlug = String(slug).toLowerCase().trim();
  if (await Company.findOne({ slug: normalizedSlug })) {
    throw new ApiError(409, `Company code "${normalizedSlug}" is already taken`);
  }

  const company = await Company.create({ name, slug: normalizedSlug, contactEmail: adminEmail });

  const admin = await User.create({
    companyId: company._id,
    email: String(adminEmail).toLowerCase().trim(),
    password: adminPassword,
    role: 'admin',
    isActive: true,
    onboardingStage: 'completed',
    personalDetails: {
      firstName: adminFirstName || 'Admin',
      lastName: adminLastName || '-',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'Prefer not to say'
    },
    contactInfo: {
      personalMobile: '0000000000',
      emergencyContactName: 'Pending',
      emergencyContactRelation: 'Pending',
      emergencyContactPhone: '0000000000',
      presentAddress: { street: 'Pending', city: 'Pending', state: 'Pending', country: 'India', zipCode: '000000' },
      permanentAddress: { street: 'Pending', city: 'Pending', state: 'Pending', country: 'India', zipCode: '000000' }
    }
  });

  await SalaryStructureTemplate.create({ ...DEFAULT_TEMPLATE, companyId: company._id });

  return { company, admin };
};
