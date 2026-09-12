import request from 'supertest';
import User from '../../models/User.js';
import Company from '../../models/Company.js';
import { runWithStore } from '../../utils/tenantContext.js';

/**
 * Default tenant shared by createUser/authAgent so records created in one test
 * land in the same company (matching pre-multitenant test expectations). The DB
 * is wiped between tests, so this is resolved by slug each call and re-created
 * if missing. Pass `companyId`/`company` in overrides to target another tenant.
 */
export const DEFAULT_COMPANY_SLUG = 'test-co';

export const getDefaultCompany = async () => {
  let c = await Company.findOne({ slug: DEFAULT_COMPANY_SLUG });
  if (!c) c = await Company.create({ slug: DEFAULT_COMPANY_SLUG, name: 'Test Co', status: 'active' });
  return c;
};

let companyCounter = 0;
/** Create an additional isolated tenant (for cross-tenant isolation tests). */
export const createCompany = (overrides = {}) => {
  companyCounter += 1;
  return Company.create({
    name: overrides.name || `Test Co ${companyCounter}`,
    slug: overrides.slug || `co-${companyCounter}`,
    status: 'active',
    ...overrides
  });
};

/** Run `fn` inside a tenant context (for direct model writes in tests/seed). */
export const runInTenant = (companyId, fn) =>
  runWithStore({ companyId: String(companyId), role: 'admin', authed: true }, fn);

/**
 * Minimal valid User payload. `companyId` is required by the schema; callers
 * that omit it get the default test company (resolved by createUser).
 */
export const buildUser = (overrides = {}) => {
  const base = {
    email: `user_${Math.floor(performance.now() * 1000)}@xyz.com`,
    password: 'Password1',
    role: 'employee',
    isActive: true,
    personalDetails: {
      firstName: 'Test',
      lastName: 'User',
      dateOfBirth: new Date('1992-05-10'),
      gender: 'Male'
    },
    contactInfo: {
      personalMobile: '9876543210',
      emergencyContactName: 'Kin',
      emergencyContactRelation: 'Sibling',
      emergencyContactPhone: '9876500000',
      presentAddress: { street: '1 St', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' },
      permanentAddress: { street: '1 St', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' }
    }
  };
  return {
    ...base,
    ...overrides,
    personalDetails: { ...base.personalDetails, ...(overrides.personalDetails || {}) },
    contactInfo: { ...base.contactInfo, ...(overrides.contactInfo || {}) },
    employeeDetails: { ...(base.employeeDetails || {}), ...(overrides.employeeDetails || {}) }
  };
};

export const createUser = async (overrides = {}) => {
  const companyId = overrides.companyId || (await getDefaultCompany())._id;
  const { company, ...rest } = overrides; // strip non-schema helper key
  return User.create(buildUser({ ...rest, companyId }));
};

/**
 * Create a user and return a supertest agent with a valid session, plus the
 * company. Logs in with the tenant's company code (slug).
 */
export const authAgent = async (app, overrides = {}) => {
  const password = overrides.password || 'Password1';
  const company = overrides.company || (overrides.companyId
    ? await Company.findById(overrides.companyId)
    : await getDefaultCompany());
  const user = await createUser({ ...overrides, companyId: company._id, password });

  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ companySlug: company.slug, email: user.email, password });
  if (res.status !== 200) {
    throw new Error(`authAgent login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { agent, user, company };
};
