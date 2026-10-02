import ExitRecord from '../models/ExitRecord.js';
import User from '../models/User.js';

/**
 * Sweeps all exits that are completed, settled, or where lastWorkingDay has passed,
 * and sets the corresponding user's isActive status to false.
 */
export const syncExitedUsersStatus = async () => {
  try {
    const today = new Date();
    // Match any exit where last working day has passed or exit is completed/settled
    const exits = await ExitRecord.find({
      $or: [
        { lastWorkingDay: { $lte: today }, status: { $in: ['Initiated', 'InProgress', 'Completed'] } },
        { status: 'Completed' },
        { 'fnfSettlement.status': 'Settled' }
      ]
    }).select('userId lastWorkingDay status');

    const userIdsToDeactivate = exits
      .map((e) => (e.userId?._id ? e.userId._id : e.userId))
      .filter(Boolean);

    if (userIdsToDeactivate.length > 0) {
      const res = await User.updateMany(
        { _id: { $in: userIdsToDeactivate }, isActive: true },
        { $set: { isActive: false } }
      );
      if (res.modifiedCount > 0) {
        console.log(`[exitSync] Deactivated ${res.modifiedCount} exited employee account(s).`);
      }
    }
  } catch (err) {
    console.error('[exitSync] Error syncing exited users status:', err.message);
  }
};

/**
 * Initializes the background scheduler to run immediately on startup
 * and then repeat on an interval (e.g. every 6 hours).
 */
export const startExitSyncScheduler = () => {
  // Run on startup
  syncExitedUsersStatus();

  // Run periodically (every 6 hours)
  const intervalMs = 6 * 60 * 60 * 1000;
  const timer = setInterval(syncExitedUsersStatus, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
};
