#!/usr/bin/env node
/**
 * Fresh application setup — creates the platform tenant + one company admin.
 * Safe to re-run (idempotent): existing users get their password reset.
 *
 * Usage:
 *   npm run db:setup -- --company-code=mirus --company-name="Mirus Med Sciences" \
 *     --admin-email=admin@mirus.com --admin-password='Admin@123'
 *
 * Or via environment / .env:
 *   SETUP_COMPANY_CODE / SETUP_COMPANY_NAME / SETUP_ADMIN_EMAIL / SETUP_ADMIN_PASSWORD
 *   (also accepts SEED_COMPANY_SLUG, SEED_COMPANY_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD)
 *
 * Optional mail (stored on the company for outbound SMTP):
 *   --smtp-host --smtp-port --smtp-user --smtp-pass --mail-from
 *   or SETUP_SMTP_* / legacy SMTP_* env vars
 *
 * Run with: npm run db:setup
 */
import 'dotenv/config';
import readline from 'node:readline/promises';
import process from 'node:process';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Company, { PLATFORM_SLUG } from '../models/Company.js';
import User from '../models/User.js';

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
};

const ask = async (rl, label, fallback = '') => {
  const hint = fallback ? ` [${fallback}]` : '';
  const answer = (await rl.question(`${label}${hint}: `)).trim();
  return answer || fallback;
};

const upsertCompany = async (slug, name) => {
  let company = await Company.findOne({ slug });
  if (!company) {
    company = await Company.create({ slug, name, status: 'active' });
    console.log(`✅ Created company "${name}" (code: ${slug})`);
  } else {
    company.name = name;
    company.status = 'active';
    await company.save();
    console.log(`♻️  Updated company "${name}" (code: ${slug})`);
  }
  return company;
};

const upsertUser = async (company, { email, password, role, firstName, lastName }) => {
  let user = await User.findOne({ companyId: company._id, email });
  if (user) {
    user.password = password;
    user.isActive = true;
    user.role = role;
    await user.save();
    console.log(`♻️  Reset ${role}: ${email} @ ${company.slug}`);
    return user;
  }
  user = await User.create({
    companyId: company._id,
    email,
    password,
    role,
    isActive: true,
    onboardingStage: 'completed',
    personalDetails: { firstName, lastName, dateOfBirth: new Date('1990-01-01'), gender: 'Prefer not to say' },
    contactInfo: {
      personalMobile: '0000000000',
      emergencyContactName: 'N/A',
      emergencyContactRelation: 'N/A',
      emergencyContactPhone: '0000000000',
      presentAddress: { street: 'HQ', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' },
      permanentAddress: { street: 'HQ', city: 'Hyderabad', state: 'Telangana', country: 'India', zipCode: '500001' }
    }
  });
  console.log(`✅ Created ${role}: ${email} @ ${company.slug}`);
  return user;
};

const applyMail = (company, mail) => {
  if (!mail.smtpUser && !mail.smtpPass && !mail.mailFrom) return false;
  company.mail = {
    smtpHost: mail.smtpHost || company.mail?.smtpHost || 'smtp.gmail.com',
    smtpPort: Number(mail.smtpPort) || company.mail?.smtpPort || 465,
    smtpUser: mail.smtpUser || company.mail?.smtpUser || '',
    smtpPass: mail.smtpPass || company.mail?.smtpPass || '',
    mailFrom: mail.mailFrom || company.mail?.mailFrom || ''
  };
  return true;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const interactive = !args['company-code'] && !process.env.SETUP_COMPANY_CODE && !process.env.SEED_COMPANY_SLUG;

  let companyCode = (args['company-code'] || process.env.SETUP_COMPANY_CODE || process.env.SEED_COMPANY_SLUG || '').toLowerCase().trim();
  let companyName = (args['company-name'] || process.env.SETUP_COMPANY_NAME || process.env.SEED_COMPANY_NAME || '').trim();
  let adminEmail = (args['admin-email'] || process.env.SETUP_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  let adminPassword = args['admin-password'] || process.env.SETUP_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || '';
  let adminFirst = args['admin-first-name'] || process.env.SEED_ADMIN_FIRST_NAME || 'Admin';
  let adminLast = args['admin-last-name'] || process.env.SEED_ADMIN_LAST_NAME || 'System';

  let mail = {
    smtpHost: args['smtp-host'] || process.env.SETUP_SMTP_HOST || process.env.SMTP_HOST || '',
    smtpPort: args['smtp-port'] || process.env.SETUP_SMTP_PORT || process.env.SMTP_PORT || '',
    smtpUser: args['smtp-user'] || process.env.SETUP_SMTP_USER || process.env.SMTP_USER || '',
    smtpPass: args['smtp-pass'] || process.env.SETUP_SMTP_PASS || process.env.SMTP_PASS || '',
    mailFrom: args['mail-from'] || process.env.SETUP_MAIL_FROM || process.env.MAIL_FROM || ''
  };

  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n=== mirus fresh setup ===\n');
    companyCode = (await ask(rl, 'Company code (login slug)', companyCode || 'mirus')).toLowerCase();
    companyName = await ask(rl, 'Company name', companyName || 'Mirus Med Sciences');
    adminEmail = (await ask(rl, 'Admin email', adminEmail || `admin@${companyCode}.com`)).toLowerCase();
    adminPassword = await ask(rl, 'Admin password', adminPassword || 'Admin@123');
    const configureMail = (await ask(rl, 'Configure SMTP now? (y/N)', 'N')).toLowerCase().startsWith('y');
    if (configureMail) {
      mail.smtpHost = await ask(rl, 'SMTP host', mail.smtpHost || 'smtp.gmail.com');
      mail.smtpPort = await ask(rl, 'SMTP port', String(mail.smtpPort || 465));
      mail.smtpUser = await ask(rl, 'SMTP username', mail.smtpUser);
      mail.smtpPass = await ask(rl, 'SMTP password / app password', mail.smtpPass);
      mail.mailFrom = await ask(rl, 'From address', mail.mailFrom || `${companyName} <${mail.smtpUser || adminEmail}>`);
    }
    rl.close();
  }

  if (!companyCode || !companyName || !adminEmail || !adminPassword) {
    console.error('Missing required values. Provide --company-code, --company-name, --admin-email, --admin-password');
    console.error('Or run without flags for an interactive prompt.');
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$|^[a-z0-9]{2,50}$/.test(companyCode)) {
    console.error('Company code must be 2–50 lowercase letters, numbers or hyphens.');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    console.error('Admin email looks invalid.');
    process.exit(1);
  }
  if (String(adminPassword).length < 8) {
    console.error('Admin password must be at least 8 characters.');
    process.exit(1);
  }

  await connectDB();

  const platform = await upsertCompany(PLATFORM_SLUG, 'Platform');
  await upsertUser(platform, {
    email: (process.env.SEED_SUPERADMIN_EMAIL || 'super@platform.local').toLowerCase(),
    password: process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMe!123',
    role: 'superadmin',
    firstName: 'Platform',
    lastName: 'Admin'
  });

  const company = await upsertCompany(companyCode, companyName);
  company.contactEmail = adminEmail;
  if (applyMail(company, mail)) {
    console.log('✅ SMTP settings saved on company');
  }
  await company.save();

  await upsertUser(company, {
    email: adminEmail,
    password: adminPassword,
    role: 'admin',
    firstName: adminFirst,
    lastName: adminLast
  });

  console.log('\n========================================================');
  console.log('  FRESH SETUP COMPLETE');
  console.log('========================================================');
  console.log(`  Company:      ${companyName}`);
  console.log(`  Company code: ${companyCode}`);
  console.log(`  Admin login:  ${companyCode} / ${adminEmail} / (your password)`);
  console.log(`  Superadmin:   ${PLATFORM_SLUG} / super@platform.local / ChangeMe!123`);
  console.log('  Configure or update SMTP later under Company Settings.');
  console.log('========================================================\n');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('❌ Setup failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
