import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';

/**
 * MonthlyTourPlan used to enforce one plan per BDM per calendar month via a
 * unique { companyId, userId, month } index. The business now requires a BDM
 * to submit multiple independent tours within the same month, so the schema
 * (models/MonthlyTourPlan.js) no longer declares that index as unique — but
 * Mongoose does not retroactively alter an index that already physically
 * exists in a real database, so the old unique index must be dropped once
 * here. This is purely an index change: no document is read, modified, or
 * deleted, and every existing MonthlyTourPlan record continues to load and
 * behave exactly as before.
 *
 * Safe to run more than once (a no-op if the unique index is already gone).
 *
 * Run with: npm run db:migrate:mtp-multi
 */
const run = async () => {
  await connectDB();
  const coll = mongoose.connection.collection('monthlytourplans');

  const indexes = await coll.indexes();
  const uniqueIdx = indexes.find(
    (i) => i.unique && i.key && Object.keys(i.key).join(',') === 'companyId,userId,month'
  );

  if (uniqueIdx) {
    await coll.dropIndex(uniqueIdx.name);
    console.log(`Dropped unique index "${uniqueIdx.name}" on monthlytourplans — multiple tours per BDM per month are now allowed.`);
  } else {
    console.log('No matching unique index found on monthlytourplans — already migrated, nothing to do.');
  }

  // Recreate as a plain (non-unique) index for the "my/team plans this month" queries.
  await coll.createIndex({ companyId: 1, userId: 1, month: 1 });
  console.log('Ensured non-unique { companyId, userId, month } index exists.');

  const count = await coll.countDocuments({});
  console.log(`monthlytourplans document count (unchanged by this migration): ${count}`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error('❌ Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
