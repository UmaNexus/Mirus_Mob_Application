import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import Notification from '../models/Notification.js';
import { registerDeviceToken, unregisterDeviceToken } from '../services/notificationService.js';
import {
  checkDoctorBirthdaysToday,
  checkAttendancePunchInReminder,
  checkAttendancePunchOutReminder,
  checkEveningDcrCutoff,
  checkMonthlyMtpCutoff,
  checkApprovalAgingAndEscalations,
} from '../services/notificationSchedulerService.js';

/**
 * POST /api/notifications/devices/register
 * Register an Expo push notification token for the current user.
 */
export const registerDevice = asyncHandler(async (req, res) => {
  const { token, platform, deviceId } = req.body;
  if (!token) {
    throw new ApiError(400, 'Push token is required');
  }

  const result = await registerDeviceToken({
    companyId: req.user.companyId,
    userId: req.user._id,
    token,
    platform: platform || 'android',
    deviceId: deviceId || null,
  });

  res.status(200).json({ success: true, message: 'Device token registered', result });
});

/**
 * POST /api/notifications/devices/unregister
 * Unregister or deactivate an Expo push token on logout.
 */
export const unregisterDevice = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    throw new ApiError(400, 'Push token is required');
  }

  await unregisterDeviceToken({
    userId: req.user._id,
    token,
  });

  res.status(200).json({ success: true, message: 'Device token unregistered' });
});

/**
 * GET /api/notifications
 * Get paginated in-app notifications for the authenticated user.
 */
export const getNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {
    recipientId: req.user._id,
  };

  if (req.query.isRead !== undefined) {
    filter.isRead = req.query.isRead === 'true';
  }

  if (req.query.module) {
    filter.module = req.query.module;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'personalDetails.firstName personalDetails.lastName role')
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientId: req.user._id, isRead: false }),
  ]);

  res.status(200).json({
    success: true,
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      unreadCount,
    },
  });
});

/**
 * GET /api/notifications/unread-count
 * High-speed unread count query for mobile header badge.
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    recipientId: req.user._id,
    isRead: false,
  });

  res.status(200).json({ success: true, unreadCount: count });
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
export const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipientId: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  res.status(200).json({ success: true, message: 'Notification marked as read', notification });
});

/**
 * PATCH /api/notifications/mark-all-read
 * Mark all notifications as read for the user.
 */
export const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipientId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  res.status(200).json({ success: true, message: 'All notifications marked as read' });
});

/**
 * POST /api/notifications/scheduler/run
 * On-demand trigger for notification checks (Doctor birthdays, punch reminders, cutoff reminders, SLA escalations).
 */
export const triggerSchedulerJobs = asyncHandler(async (req, res) => {
  const { job } = req.body || {};
  const result = {};

  if (!job || job === 'birthdays') {
    result.birthdays = await checkDoctorBirthdaysToday();
  }
  if (!job || job === 'punchIn') {
    result.punchIn = await checkAttendancePunchInReminder();
  }
  if (!job || job === 'punchOut') {
    result.punchOut = await checkAttendancePunchOutReminder();
  }
  if (!job || job === 'dcrCutoff') {
    result.dcrCutoff = await checkEveningDcrCutoff();
  }
  if (!job || job === 'mtpCutoff') {
    result.mtpCutoff = await checkMonthlyMtpCutoff();
  }
  if (!job || job === 'escalations') {
    result.escalations = await checkApprovalAgingAndEscalations();
  }

  res.status(200).json({ success: true, message: 'Scheduler jobs executed', result });
});
