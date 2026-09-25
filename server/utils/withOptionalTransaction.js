import mongoose from 'mongoose';

/**
 * Runs `fn(session)` inside a real multi-document transaction when the
 * connected MongoDB deployment supports one (a replica set / mongos);
 * otherwise runs `fn(null)` without a session. Mirrors the existing
 * replica-set-detection fallback in server/scripts/delete-user-payslips.js —
 * the same pattern, made reusable, since the test suite's MongoMemoryServer
 * runs standalone (no transaction support) while a production replica set
 * gets true all-or-nothing atomicity.
 */
export const withOptionalTransaction = async (fn) => {
  let isReplicaSet = false;
  try {
    const admin = mongoose.connection.db.admin();
    let helloRes;
    try {
      helloRes = await admin.command({ hello: 1 });
    } catch (e) {
      helloRes = await admin.command({ ismaster: 1 });
    }
    if (helloRes && helloRes.setName) isReplicaSet = true;
  } catch (e) {
    isReplicaSet = false;
  }

  if (!isReplicaSet) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    session.endSession();
  }
};
