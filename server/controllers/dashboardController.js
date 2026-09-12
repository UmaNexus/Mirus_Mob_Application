import User from '../models/User.js';
import OfferLetter from '../models/OfferLetter.js';
import SalarySlip from '../models/SalarySlip.js';
import Activity from '../models/Activity.js';
import asyncHandler from '../utils/asyncHandler.js';
import { formatActivityTime, toneForAction } from '../services/activityService.js';

/**
 * GET /api/dashboard/stats
 * Aggregate counters for the admin/HR dashboard cards.
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Headcount = provisioned active employees (employee id assigned, not soft-deleted).
  const [totalEmployees, pendingOffers, slipsThisMonth, offerStatusAgg, pendingDocsAgg] = await Promise.all([
    User.countDocuments({
      role: 'employee',
      deletedAt: null,
      isActive: true,
      'employeeDetails.employeeId': { $exists: true, $nin: [null, ''] }
    }),
    OfferLetter.countDocuments({ status: { $in: ['sent', 'pending'] } }),
    SalarySlip.countDocuments({ month, year }),
    OfferLetter.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.aggregate([
      { $unwind: '$uploadedDocuments' },
      { $match: { 'uploadedDocuments.verificationStatus': 'Pending' } },
      { $count: 'n' }
    ])
  ]);

  const byStatus = Object.fromEntries(offerStatusAgg.map((s) => [s._id, s.n]));
  const accepted = byStatus.accepted || 0;
  const declined = byStatus.declined || 0;
  const decided = accepted + declined;
  const acceptanceRate = decided ? Math.round((accepted / decided) * 100) : 0;

  res.status(200).json({
    success: true,
    stats: {
      totalEmployees,
      pendingOffers,
      slipsIssued: slipsThisMonth,
      slipsPeriod: { month, year },
      pendingVerifications: pendingDocsAgg[0]?.n || 0,
      acceptanceRate
    }
  });
});

/**
 * GET /api/dashboard/activity?limit=8
 * Latest audit-log entries for the Recent Activity panel.
 */
export const getDashboardActivity = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
  const rows = await Activity.find().sort({ createdAt: -1 }).limit(limit);
  const data = rows.map((a) => ({
    id: a._id,
    message: a.message,
    action: a.action,
    actorName: a.actorName,
    entityType: a.entityType,
    time: formatActivityTime(a.createdAt),
    createdAt: a.createdAt,
    tone: toneForAction(a.action)
  }));
  res.status(200).json({ success: true, data });
});
