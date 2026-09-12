import mongoose from 'mongoose';

/**
 * Company — the tenant root (Epic T). Every tenant-scoped record references one
 * via `companyId`. `slug` is the tenant resolver used at login (company code)
 * and, later, subdomains.
 *
 * A reserved platform company (slug '_platform') houses the superadmin and is
 * exempt from tenant scoping.
 */

const MailAccountSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  smtpHost: { type: String, trim: true, default: 'smtp.gmail.com' },
  smtpPort: { type: Number, default: 465 },
  smtpUser: { type: String, trim: true, default: '' },
  smtpPass: { type: String, default: '' },
  mailFrom: { type: String, trim: true, default: '' },
  isDefault: { type: Boolean, default: false },
  active: { type: Boolean, default: true }
}, { _id: true });

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },

  // Branding + PDF-sealing assets (Epic C).
  branding: {
    logoUrl: { type: String, default: null },
    /** Company letter header (image or PDF) drawn on every generated letter. */
    letterheadUrl: { type: String, default: null },
    letterheadFileName: { type: String, trim: true },
    /** Shared letter template/outline PDF used for all generated letters when set. */
    letterOutlineUrl: { type: String, default: null },
    letterOutlineFileName: { type: String, trim: true },
    // Pre-saved stamp + authorized-signatory signature baked onto issued PDFs.
    stampUrl: { type: String, default: null },
    /** Combined company logo + stamp image used on letter seals when set. */
    logoWithStampUrl: { type: String, default: null },
    signatureUrl: { type: String, default: null },
    authorizedSignatoryName: { type: String, trim: true },
    authorizedSignatoryDesignation: { type: String, trim: true }
  },

  /** HR contact block printed on offer / appointment letters. */
  hr: {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    contact: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true }
  },

  // Statutory registration numbers (GSTIN / CIN shown in Company Settings).
  statutory: {
    gstin: { type: String, trim: true },
    cin: { type: String, trim: true }
  },

  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    zipCode: { type: String, trim: true }
  },

  /**
   * Legacy single SMTP block — kept in sync with the default mailAccounts entry
   * for backward compatibility with older reads.
   */
  mail: {
    smtpHost: { type: String, trim: true, default: 'smtp.gmail.com' },
    smtpPort: { type: Number, default: 465 },
    smtpUser: { type: String, trim: true, default: '' },
    smtpPass: { type: String, default: '' },
    mailFrom: { type: String, trim: true, default: '' }
  },

  /** Multiple outbound SMTP accounts; exactly one active account should be default. */
  mailAccounts: { type: [MailAccountSchema], default: [] },

  contactEmail: { type: String, trim: true, lowercase: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

/** The reserved platform tenant slug (houses superadmins). */
export const PLATFORM_SLUG = '_platform';

/** Present one mail account without exposing the password. */
const presentMailAccount = (a) => ({
  _id: a._id,
  label: a.label || 'SMTP',
  smtpHost: a.smtpHost || 'smtp.gmail.com',
  smtpPort: a.smtpPort || 465,
  smtpUser: a.smtpUser || '',
  mailFrom: a.mailFrom || '',
  isDefault: Boolean(a.isDefault),
  active: a.active !== false,
  smtpPassSet: Boolean(a.smtpPass)
});

/**
 * Ensure mailAccounts is populated from legacy `mail` when empty.
 * Returns a plain array suitable for API responses (no passwords).
 */
export const resolveMailAccounts = (company) => {
  const o = typeof company.toObject === 'function' ? company.toObject() : { ...company };
  let accounts = Array.isArray(o.mailAccounts) ? o.mailAccounts : [];
  if (!accounts.length && (o.mail?.smtpUser || o.mail?.mailFrom || o.mail?.smtpPass)) {
    accounts = [{
      _id: 'legacy',
      label: 'Primary',
      smtpHost: o.mail.smtpHost || 'smtp.gmail.com',
      smtpPort: o.mail.smtpPort || 465,
      smtpUser: o.mail.smtpUser || '',
      smtpPass: o.mail.smtpPass || '',
      mailFrom: o.mail.mailFrom || '',
      isDefault: true,
      active: true
    }];
  }
  return accounts.map(presentMailAccount);
};

/** Pick the active default account (or first active) for sending. */
export const pickDefaultMailAccount = (company) => {
  const o = typeof company.toObject === 'function' ? company.toObject() : { ...company };
  let accounts = Array.isArray(o.mailAccounts) ? o.mailAccounts.filter((a) => a.active !== false) : [];
  if (!accounts.length && o.mail) {
    return {
      label: 'Primary',
      smtpHost: o.mail.smtpHost || 'smtp.gmail.com',
      smtpPort: o.mail.smtpPort || 465,
      smtpUser: o.mail.smtpUser || '',
      smtpPass: o.mail.smtpPass || '',
      mailFrom: o.mail.mailFrom || '',
      isDefault: true,
      active: true
    };
  }
  return accounts.find((a) => a.isDefault) || accounts[0] || null;
};

/** Sync legacy `mail` from the default account (keeps older code paths working). */
export const syncLegacyMailFromAccounts = (company) => {
  const def = pickDefaultMailAccount(company);
  if (!def) return;
  if (!company.mail) company.mail = {};
  company.mail.smtpHost = def.smtpHost || 'smtp.gmail.com';
  company.mail.smtpPort = def.smtpPort || 465;
  company.mail.smtpUser = def.smtpUser || '';
  company.mail.mailFrom = def.mailFrom || '';
  if (def.smtpPass) company.mail.smtpPass = def.smtpPass;
};

/** API-safe company document — SMTP passwords never leave the server. */
export const presentCompany = (company) => {
  const o = typeof company.toObject === 'function' ? company.toObject() : { ...company };
  const accounts = resolveMailAccounts(company);
  o.mailAccounts = accounts;
  const def = accounts.find((a) => a.isDefault) || accounts[0];
  o.mail = def
    ? {
      smtpHost: def.smtpHost,
      smtpPort: def.smtpPort,
      smtpUser: def.smtpUser,
      mailFrom: def.mailFrom,
      smtpPassSet: def.smtpPassSet
    }
    : {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpUser: '',
      mailFrom: '',
      smtpPassSet: false
    };
  return o;
};

export default mongoose.model('Company', CompanySchema);
