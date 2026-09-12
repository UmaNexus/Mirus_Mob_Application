import fs from 'node:fs';
import path from 'node:path';
import Company, { presentCompany, syncLegacyMailFromAccounts } from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { COMPANY_ASSET_DIR } from '../middleware/uploadCompanyAsset.js';

const applyMailAccounts = (company, incoming) => {
  if (!Array.isArray(incoming)) throw new ApiError(400, 'mailAccounts must be an array');
  if (incoming.length === 0) {
    company.mailAccounts = [];
    company.mail = {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpUser: '',
      smtpPass: '',
      mailFrom: ''
    };
    return;
  }

  const existingById = new Map(
    (company.mailAccounts || []).map((a) => [String(a._id), a])
  );

  const next = incoming.map((raw, idx) => {
    const label = String(raw.label || '').trim() || `SMTP ${idx + 1}`;
    const smtpHost = String(raw.smtpHost || 'smtp.gmail.com').trim() || 'smtp.gmail.com';
    const smtpPort = Number(raw.smtpPort) || 465;
    if (!Number.isFinite(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new ApiError(400, `Invalid SMTP port for "${label}"`);
    }
    const smtpUser = String(raw.smtpUser || '').trim();
    const mailFrom = String(raw.mailFrom || '').trim();
    const active = raw.active !== false && raw.active !== 'false';
    const prev = raw._id && raw._id !== 'legacy' ? existingById.get(String(raw._id)) : null;
    let smtpPass = prev?.smtpPass || '';
    if (typeof raw.smtpPass === 'string' && raw.smtpPass.trim()) {
      smtpPass = raw.smtpPass.trim();
    }
    return {
      ...(prev?._id ? { _id: prev._id } : {}),
      label,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      mailFrom,
      isDefault: Boolean(raw.isDefault),
      active
    };
  });

  const activeAccounts = next.filter((a) => a.active);
  if (!activeAccounts.length) {
    throw new ApiError(400, 'At least one SMTP account must be active');
  }
  let defaultIdx = next.findIndex((a) => a.active && a.isDefault);
  if (defaultIdx < 0) defaultIdx = next.findIndex((a) => a.active);
  next.forEach((a, i) => { a.isDefault = i === defaultIdx; });

  company.mailAccounts = next;
  syncLegacyMailFromAccounts(company);
};

// Company is the tenant root (not tenant-scoped) — always resolve via the
// caller's own companyId so a tenant can only read/write its own config.
const loadOwnCompany = async (req) => {
  const company = await Company.findById(req.user.companyId);
  if (!company) throw new ApiError(404, 'Company not found');
  return company;
};

/** GET /api/company — the caller's company configuration (Epic C). */
export const getCompany = asyncHandler(async (req, res) => {
  const company = await loadOwnCompany(req);
  res.status(200).json({ success: true, company: presentCompany(company) });
});

/** PUT /api/company — update branding, HR, statutory, address and mail (Epic C). */
export const updateCompany = asyncHandler(async (req, res) => {
  const company = await loadOwnCompany(req);
  const b = req.body;

  if (b.name !== undefined) company.name = b.name;
  if (b.contactEmail !== undefined) company.contactEmail = b.contactEmail;

  if (b.branding) {
    ['authorizedSignatoryName', 'authorizedSignatoryDesignation'].forEach((k) => {
      if (b.branding[k] !== undefined) company.branding[k] = b.branding[k];
    });
  }
  if (b.hr) {
    if (!company.hr) company.hr = {};
    ['name', 'designation', 'contact', 'email'].forEach((k) => {
      if (b.hr[k] !== undefined) company.hr[k] = b.hr[k];
    });
  }
  if (b.statutory) {
    ['gstin', 'cin'].forEach((k) => {
      if (b.statutory[k] !== undefined) company.statutory[k] = b.statutory[k];
    });
  }
  if (b.address) {
    ['street', 'city', 'state', 'country', 'zipCode'].forEach((k) => {
      if (b.address[k] !== undefined) company.address[k] = b.address[k];
    });
  }
  // Prefer multi-account payload; fall back to legacy single `mail` object.
  if (Array.isArray(b.mailAccounts)) {
    applyMailAccounts(company, b.mailAccounts);
  } else if (b.mail) {
    const legacyAsAccount = {
      _id: company.mailAccounts?.[0]?._id,
      label: company.mailAccounts?.[0]?.label || 'Primary',
      smtpHost: b.mail.smtpHost ?? company.mail?.smtpHost ?? 'smtp.gmail.com',
      smtpPort: b.mail.smtpPort ?? company.mail?.smtpPort ?? 465,
      smtpUser: b.mail.smtpUser ?? company.mail?.smtpUser ?? '',
      mailFrom: b.mail.mailFrom ?? company.mail?.mailFrom ?? '',
      smtpPass: typeof b.mail.smtpPass === 'string' ? b.mail.smtpPass : '',
      isDefault: true,
      active: true
    };
    applyMailAccounts(company, [legacyAsAccount]);
  }

  // Migrate legacy-only mail into mailAccounts on first save if still empty.
  if (!(company.mailAccounts || []).length && (company.mail?.smtpUser || company.mail?.smtpPass)) {
    applyMailAccounts(company, [{
      label: 'Primary',
      smtpHost: company.mail.smtpHost || 'smtp.gmail.com',
      smtpPort: company.mail.smtpPort || 465,
      smtpUser: company.mail.smtpUser || '',
      smtpPass: company.mail.smtpPass || '',
      mailFrom: company.mail.mailFrom || '',
      isDefault: true,
      active: true
    }]);
  }

  await company.save();
  if (Array.isArray(b.mailAccounts) || b.mail) {
    const { clearMailTransportCache } = await import('../services/emailService.js');
    clearMailTransportCache(String(company._id));
  }
  res.status(200).json({
    success: true,
    message: 'Company configuration updated',
    company: presentCompany(company)
  });
});

const ASSET_KINDS = {
  logo: { url: 'logoUrl' },
  letterhead: { url: 'letterheadUrl', fileName: 'letterheadFileName' },
  letterOutline: { url: 'letterOutlineUrl', fileName: 'letterOutlineFileName' },
  stamp: { url: 'stampUrl' },
  logoWithStamp: { url: 'logoWithStampUrl' },
  signature: { url: 'signatureUrl' }
};

/**
 * POST /api/company/asset/:kind — upload a branding asset
 * (logo | letterhead | letterOutline | stamp | logoWithStamp | signature).
 */
export const uploadCompanyBrandingAsset = asyncHandler(async (req, res) => {
  const meta = ASSET_KINDS[req.params.kind];
  if (!meta) throw new ApiError(400, `Invalid asset kind. Use one of: ${Object.keys(ASSET_KINDS).join(', ')}`);
  if (!req.file) throw new ApiError(400, 'No file uploaded (field "asset")');

  const company = await loadOwnCompany(req);
  if (!company.branding) company.branding = {};

  // Downscale/compress large scans so offer/appointment PDF gen stays fast.
  const { optimizeCompanyBrandingFile } = await import('../services/brandingOptimize.js');
  const { clearBrandingAssetCache } = await import('../services/pdfService.js');
  const absUploaded = path.resolve(process.cwd(), 'uploads', 'company', req.file.filename);
  const optimized = await optimizeCompanyBrandingFile(absUploaded, req.params.kind);

  const previousUrl = company.branding[meta.url];
  company.branding[meta.url] = `uploads/company/${optimized.filename}`;
  if (meta.fileName) company.branding[meta.fileName] = req.file.originalname;
  await company.save();

  clearBrandingAssetCache(previousUrl);
  clearBrandingAssetCache(company.branding[meta.url]);

  res.status(200).json({
    success: true,
    message: `${req.params.kind} updated`,
    url: company.branding[meta.url],
    fileName: meta.fileName ? company.branding[meta.fileName] : undefined
  });
});

/**
 * GET /api/company/asset/:kind — stream a branding asset for preview (auth required).
 */
export const getCompanyBrandingAsset = asyncHandler(async (req, res) => {
  const meta = ASSET_KINDS[req.params.kind];
  if (!meta) throw new ApiError(400, `Invalid asset kind. Use one of: ${Object.keys(ASSET_KINDS).join(', ')}`);

  const company = await loadOwnCompany(req);
  const rel = company.branding?.[meta.url];
  if (!rel) throw new ApiError(404, `No ${req.params.kind} uploaded`);

  const abs = path.resolve(rel);
  if (!abs.startsWith(COMPANY_ASSET_DIR) || !fs.existsSync(abs)) {
    throw new ApiError(404, `${req.params.kind} file missing on disk`);
  }

  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.pdf' ? 'application/pdf'
        : 'application/octet-stream';
  const downloadName = (meta.fileName && company.branding[meta.fileName])
    || path.basename(abs);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${String(downloadName).replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=60');
  fs.createReadStream(abs).pipe(res);
});
