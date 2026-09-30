import { Expo } from 'expo-server-sdk';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

const expo = new Expo();

/**
 * Register or update an Expo push token for an authenticated user.
 */
export async function registerDeviceToken({ companyId, userId, token, platform = 'android', deviceId = null }) {
  if (!userId || !token) {
    throw new Error('userId and token are required for device registration');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.pushDevices) {
    user.pushDevices = [];
  }

  const existingIndex = user.pushDevices.findIndex((d) => d.token === token);
  if (existingIndex >= 0) {
    user.pushDevices[existingIndex].isActive = true;
    user.pushDevices[existingIndex].lastSeenAt = new Date();
    user.pushDevices[existingIndex].platform = platform || user.pushDevices[existingIndex].platform;
    if (deviceId) user.pushDevices[existingIndex].deviceId = deviceId;
  } else {
    user.pushDevices.push({
      token,
      platform,
      deviceId,
      isActive: true,
      lastSeenAt: new Date(),
    });
  }

  await user.save();
  return { success: true, count: user.pushDevices.filter((d) => d.isActive).length };
}

/**
 * Deactivate or unregister a push token (e.g. upon user logout).
 */
export async function unregisterDeviceToken({ userId, token }) {
  if (!userId || !token) return { success: false };

  const user = await User.findById(userId);
  if (!user || !user.pushDevices) return { success: false };

  const device = user.pushDevices.find((d) => d.token === token);
  if (device) {
    device.isActive = false;
    await user.save();
  }

  return { success: true };
}

/**
 * Dispatch an in-app and push notification to one or multiple recipients.
 * Designed to be non-blocking and safe: failures never throw to callers.
 */
export async function dispatchNotification({
  companyId,
  recipientIds = [],
  senderId = null,
  module,
  eventId,
  title,
  body,
  priority = 'medium',
  deepLink = null,
  data = {},
  entityType = null,
  entityId = null,
}) {
  try {
    const rawIds = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
    const targets = rawIds.filter(Boolean).map((id) => String(id));

    if (targets.length === 0) {
      return [];
    }

    // 1. Create In-App Notification records
    const notificationDocs = [];
    for (const recipientId of targets) {
      const doc = new Notification({
        companyId,
        recipientId,
        senderId,
        module,
        eventId,
        title,
        body,
        priority,
        deepLink,
        data,
        entityType,
        entityId,
        pushStatus: 'queued',
      });
      await doc.save();
      notificationDocs.push(doc);
    }

    // 2. Fetch active push tokens for these recipients
    const users = await User.find({
      _id: { $in: targets },
      'pushDevices.isActive': true,
    }).select('_id pushDevices');

    const pushMessages = [];
    const tokenToUserMap = new Map();

    for (const user of users) {
      if (!user.pushDevices || user.pushDevices.length === 0) continue;

      const activeDevices = user.pushDevices.filter((d) => d.isActive && d.token);
      for (const device of activeDevices) {
        if (!Expo.isExpoPushToken(device.token)) {
          // Token is not a valid Expo token (e.g. test or dummy)
          continue;
        }

        tokenToUserMap.set(device.token, user._id);

        pushMessages.push({
          to: device.token,
          sound: 'default',
          title,
          body,
          priority: priority === 'critical' || priority === 'high' ? 'high' : 'default',
          channelId: 'default',
          data: {
            eventId,
            module,
            deepLink,
            entityType,
            entityId,
            ...(data || {}),
          },
        });
      }
    }

    // 3. Batch and dispatch via Expo push service
    if (pushMessages.length > 0) {
      const chunks = expo.chunkPushNotifications(pushMessages);
      for (const chunk of chunks) {
        try {
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            const msg = chunk[i];
            if (ticket.status === 'error') {
              console.warn(`[NotificationService] Expo ticket error for token ${msg.to}:`, ticket.message, ticket.details);
              if (ticket.details?.error === 'DeviceNotRegistered') {
                const targetUserId = tokenToUserMap.get(msg.to);
                if (targetUserId) {
                  await User.updateOne(
                    { _id: targetUserId, 'pushDevices.token': msg.to },
                    { $set: { 'pushDevices.$.isActive': false } }
                  ).catch(() => {});
                }
              }
            }
          }
        } catch (chunkError) {
          console.error('[NotificationService] Error sending chunk to Expo:', chunkError);
        }
      }

      // Mark status as sent for created docs
      await Notification.updateMany(
        { _id: { $in: notificationDocs.map((d) => d._id) } },
        { $set: { pushStatus: 'sent' } }
      ).catch(() => {});
    } else {
      await Notification.updateMany(
        { _id: { $in: notificationDocs.map((d) => d._id) } },
        { $set: { pushStatus: 'not_sent' } }
      ).catch(() => {});
    }

    return notificationDocs;
  } catch (error) {
    console.error('[NotificationService] Unhandled dispatchNotification error:', error);
    return [];
  }
}

export default {
  registerDeviceToken,
  unregisterDeviceToken,
  dispatchNotification,
};
