import 'dotenv/config';
import connectDB from '../config/db.js';
import User from '../models/User.js';

/**
 * Migrate employee codes EMP##### → MMS##### (Mirus Med Sciences).
 *
 * Dry-run (default):
 *   node scripts/migrate-employee-ids-to-mms.js
 *
 * Apply updates:
 *   node scripts/migrate-employee-ids-to-mms.js --apply
 *
 * Soft-deleted users are included (IDs stay reserved / unique).
 * Rows that would collide with an existing MMS id are skipped and reported.
 */

const APPLY = process.argv.includes('--apply');
const FROM_PREFIX = 'EMP';
const TO_PREFIX = (process.env.EMPLOYEE_ID_PREFIX || 'MMS').toUpperCase();

const toNewId = (oldId) => {
  const raw = String(oldId || '').trim();
  const m = raw.match(new RegExp(`^${FROM_PREFIX}(.+)$`, 'i'));
  if (!m) return null;
  return `${TO_PREFIX}${m[1]}`.toUpperCase();
};

const run = async () => {
  await connectDB();

  const candidates = await User.find({
    'employeeDetails.employeeId': { $regex: new RegExp(`^${FROM_PREFIX}`, 'i') }
  }).select('email companyId deletedAt employeeDetails.employeeId personalDetails.firstName personalDetails.lastName');

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Prefix: ${FROM_PREFIX} → ${TO_PREFIX}`);
  console.log(`Candidates: ${candidates.length}\n`);

  const summary = { updated: 0, skipped: 0, conflicts: 0, wouldUpdate: 0 };

  for (const user of candidates) {
    const oldId = user.employeeDetails?.employeeId;
    const newId = toNewId(oldId);
    const name = `${user.personalDetails?.firstName || ''} ${user.personalDetails?.lastName || ''}`.trim() || user.email;

    if (!newId) {
      console.log(`SKIP  ${oldId} (${name}) — unexpected format`);
      summary.skipped += 1;
      continue;
    }

    const conflict = await User.findOne({
      _id: { $ne: user._id },
      companyId: user.companyId,
      'employeeDetails.employeeId': newId
    }).select('_id email employeeDetails.employeeId');

    if (conflict) {
      console.log(`CONFLICT  ${oldId} → ${newId} (${name}) — already used by ${conflict.email}`);
      summary.conflicts += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`WOULD UPDATE  ${oldId} → ${newId}  (${name}${user.deletedAt ? ', deleted' : ''})`);
      summary.wouldUpdate += 1;
      continue;
    }

    user.employeeDetails.employeeId = newId;
    await user.save();
    console.log(`UPDATED  ${oldId} → ${newId}  (${name})`);
    summary.updated += 1;
  }

  console.log('\nSummary:', summary);
  if (!APPLY && (summary.wouldUpdate || summary.conflicts)) {
    console.log('\nRe-run with --apply to persist changes (after resolving conflicts).');
  }

  process.exit(summary.conflicts && APPLY ? 1 : 0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
