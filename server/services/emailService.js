import nodemailer from 'nodemailer';
import Company, { pickDefaultMailAccount } from '../models/Company.js';
import { currentCompanyId } from '../utils/tenantContext.js';

/**
 * Transactional email service.
 *
 * SMTP credentials are stored per-company in Company.mailAccounts (default
 * account) and loaded on every send from the active tenant context. When
 * NODE_ENV is "test" or the company has no SMTP user/password, messages fall
 * back to a console stub + in-memory outbox (used by tests).
 */

const outbox = [];

/** Reused SMTP transports keyed by companyId + host/user/port. */
const transportCache = new Map();

const SMTP_TIMEOUTS = {
  connectionTimeout: 12_000,
  greetingTimeout: 12_000,
  socketTimeout: 45_000
};

const transportCacheKey = (companyId, mail) =>
  `${companyId}|${mail.smtpHost || ''}|${mail.smtpPort || ''}|${mail.smtpUser || ''}`;

/** Drop cached transporters (call after SMTP settings change). */
export const clearMailTransportCache = (companyId = null) => {
  if (!companyId) {
    for (const t of transportCache.values()) {
      try { t.close?.(); } catch { /* ignore */ }
    }
    transportCache.clear();
    return;
  }
  const prefix = `${companyId}|`;
  for (const [key, t] of transportCache.entries()) {
    if (key.startsWith(prefix)) {
      try { t.close?.(); } catch { /* ignore */ }
      transportCache.delete(key);
    }
  }
};

const getOrCreateTransport = (companyId, mail) => {
  const key = transportCacheKey(companyId, mail);
  const hit = transportCache.get(key);
  if (hit) return hit;

  const port = Number(mail.smtpPort) || 465;
  const user = String(mail.smtpUser).trim();
  const pass = String(mail.smtpPass).replace(/\s+/g, '');
  const transport = nodemailer.createTransport({
    host: (mail.smtpHost && String(mail.smtpHost).trim()) || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    ...SMTP_TIMEOUTS
  });
  transportCache.set(key, transport);
  return transport;
};

const loadCompanyMail = async () => {
  if (process.env.NODE_ENV === 'test') return { brandName: 'mirus', transport: null, from: null };

  const companyId = currentCompanyId();
  if (!companyId) {
    console.warn('[email] No tenant companyId in context — stubbing send.');
    return { brandName: 'mirus', transport: null, from: null };
  }

  const company = await Company.findById(companyId).select('name mail mailAccounts contactEmail').lean();
  if (!company) {
    console.warn(`[email] Company ${companyId} not found — stubbing send.`);
    return { brandName: 'mirus', transport: null, from: null };
  }

  const mail = pickDefaultMailAccount(company) || {};
  const brandName = company.name || 'HRMS';

  if (!mail.smtpUser || !mail.smtpPass) {
    console.warn(`[email] SMTP not configured for company "${brandName}" — stubbing send.`);
    return { brandName, transport: null, from: null };
  }

  const user = String(mail.smtpUser).trim();
  const from = (mail.mailFrom && String(mail.mailFrom).trim())
    || `${brandName} <${user}>`;

  return {
    brandName,
    from,
    accountLabel: mail.label || 'Primary',
    transport: getOrCreateTransport(companyId, mail)
  };
};

const wrapHtml = (body, brandName) =>
  `<div style="font-family:Inter,Arial,sans-serif;color:#2D2D2D;line-height:1.6">
     <div style="background:#E89000;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:700">${brandName}</div>
     <div style="border:1px solid #E0E0E0;border-top:0;padding:20px;border-radius:0 0 8px 8px">${body}</div>
   </div>`;

const deliver = async ({ to, subject, body, html, meta = {}, cfg, attachments }) => {
  outbox.push({ to, subject, body, meta, sentAt: new Date(), attachmentCount: attachments?.length || 0 });
  const brandName = cfg?.brandName || 'mirus';

  if (!cfg?.transport) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email stub] to=${to} subject="${subject}"`);
    return { delivered: false, mode: 'stub', brandName };
  }

  try {
    const info = await cfg.transport.sendMail({
      from: cfg.from,
      to,
      subject,
      text: body,
      html: html || wrapHtml(body, brandName),
      attachments: attachments?.length ? attachments : undefined
    });
    return { delivered: true, mode: 'smtp', id: info.messageId, brandName };
  } catch (err) {
    console.error(`[email failed] to=${to}: ${err.message}`);
    return { delivered: false, mode: 'smtp', error: err.message, brandName };
  }
};

export const sendEmail = async ({ to, subject, body, html, meta = {}, attachments } = {}) => {
  const cfg = await loadCompanyMail();
  return deliver({ to, subject, body, html, meta, cfg, attachments });
};

/** Escape HTML, preserve newlines, and turn bare URLs into links. */
const plainTextToHtml = (text = '') => {
  const esc = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const linked = esc.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );
  return linked
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
    .join('');
};

/**
 * Email an offer invite. Prefer template-rendered subject/body; attach the PDF when provided.
 */
export const sendOfferInvite = async ({
  to, fullName, offerUrl, subject, body, pdfPath, fileName
} = {}) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  const subj = (subject && String(subject).trim())
    || `Your employment offer from ${brand}`;
  const text = (body && String(body).trim())
    || `Hi ${fullName}, view and sign your offer here: ${offerUrl}`;
  const attachments = pdfPath
    ? [{
      filename: fileName || 'offer-letter.pdf',
      path: pdfPath,
      contentType: 'application/pdf'
    }]
    : undefined;
  return deliver({
    to,
    subject: subj,
    body: text,
    html: wrapHtml(plainTextToHtml(text), brand),
    meta: { type: 'offer_invite', offerUrl, hasPdf: Boolean(pdfPath) },
    cfg,
    attachments
  });
};

export const sendPasswordSetup = async ({ to, fullName, setupUrl }) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  return deliver({
    to,
    subject: `Set up your ${brand} employee account`,
    body: `Welcome aboard ${fullName}! Set your password here: ${setupUrl}`,
    meta: { type: 'password_setup', setupUrl },
    cfg
  });
};

export const sendCredentials = async ({ to, fullName, employeeId, email, tempPassword, loginUrl }) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  const body = [
    `Hi ${fullName},`,
    '',
    `Your ${brand} employee account is ready.`,
    '',
    `Employee ID: ${employeeId}`,
    `Email: ${email}`,
    `Temporary password: ${tempPassword}`,
    '',
    'You can sign in with either your Employee ID or email, plus this password.',
    `Login: ${loginUrl}`,
    '',
    'Please change your password after your first login.'
  ].join('\n');
  const html = wrapHtml(
    `<p>Hi <strong>${fullName}</strong>,</p>
     <p>Your <strong>${brand}</strong> employee account is ready.</p>
     <ul>
       <li><strong>Employee ID:</strong> ${employeeId}</li>
       <li><strong>Email:</strong> ${email}</li>
       <li><strong>Temporary password:</strong> <code>${tempPassword}</code></li>
     </ul>
     <p>You can sign in with either your <strong>Employee ID</strong> or <strong>email</strong>, plus this password.</p>
     <p><a href="${loginUrl}">${loginUrl}</a></p>
     <p>Please change your password after your first login.</p>`,
    brand
  );
  return deliver({
    to,
    subject: `Your ${brand} employee account is ready`,
    body,
    html,
    meta: { type: 'credentials', employeeId },
    cfg
  });
};

/**
 * Email a generated salary slip to the employee, with PDF attached when available.
 */
export const sendPayslipNotice = async ({
  to, fullName, period, pdfPath, fileName
} = {}) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  const subj = `Your salary slip for ${period}`;
  const body = [
    `Hi ${fullName},`,
    '',
    `Please find attached your salary slip for ${period}.`,
    '',
    'You can also view and download it anytime from Salary Slips after signing in to the employee portal.',
    '',
    `— ${brand}`
  ].join('\n');
  const html = wrapHtml(
    `<p>Hi <strong>${fullName}</strong>,</p>
     <p>Please find attached your salary slip for <strong>${period}</strong>.</p>
     <p>You can also view and download it anytime from <strong>Salary Slips</strong> after signing in to the employee portal.</p>`,
    brand
  );
  return deliver({
    to,
    subject: subj,
    body,
    html,
    meta: { type: 'payslip_notice', period, hasPdf: Boolean(pdfPath) },
    cfg,
    attachments: pdfPath
      ? [{
        filename: fileName || `payslip-${period.replace(/\s+/g, '-')}.pdf`,
        path: pdfPath,
        contentType: 'application/pdf'
      }]
      : undefined
  });
};

/**
 * Email an appointment letter PDF using subject/body from Letter Template Setup
 * (placeholders already applied by the caller).
 */
export const sendAppointmentLetter = async ({ to, subject, body, pdfPath, fileName } = {}) => {
  const cfg = await loadCompanyMail();
  const brand = cfg.brandName;
  const subj = (subject && String(subject).trim())
    || `Your appointment letter from ${brand}`;
  const text = (body && String(body).trim())
    || `Please find attached your Letter of Appointment from ${brand}.`;
  return deliver({
    to,
    subject: subj,
    body: text,
    html: wrapHtml(plainTextToHtml(text), brand),
    meta: { type: 'appointment_letter', hasPdf: Boolean(pdfPath) },
    cfg,
    attachments: pdfPath
      ? [{
        filename: fileName || 'appointment-letter.pdf',
        path: pdfPath,
        contentType: 'application/pdf'
      }]
      : undefined
  });
};

/** Email a generated C&F agreement PDF to the partner. */
export const sendCFAgreement = async ({ to, partyName, typeLabel, brandName, pdfPath, fileName }) => {
  const cfg = await loadCompanyMail();
  const brand = brandName || cfg.brandName;
  const label = typeLabel || 'C&F Agreement';
  const who = partyName || 'Partner';
  return deliver({
    to,
    subject: `${label} from ${brand}`,
    body: `Dear ${who},\n\nPlease find attached your ${label} from ${brand}.\n\nRegards,\n${brand}`,
    html: wrapHtml(
      `<p>Dear <strong>${who}</strong>,</p>
       <p>Please find attached your <strong>${label}</strong> from ${brand}.</p>
       <p>Regards,<br/>${brand}</p>`,
      brand
    ),
    meta: { type: 'cf_agreement', typeLabel: label },
    cfg,
    attachments: [{
      filename: fileName || 'cf-agreement.pdf',
      path: pdfPath,
      contentType: 'application/pdf'
    }]
  });
};

export const getOutbox = () => [...outbox];
export const clearOutbox = () => { outbox.length = 0; };
