import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as notificationsApi from '../api/notifications';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions and register the Expo push token with the backend.
 */
export async function registerForPushNotificationsAsync() {
  let token = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A73E8',
      sound: 'default',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[NotificationService] Push notification permission not granted');
      return null;
    }

    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const pushTokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      token = pushTokenData.data;

      // Register device token with backend
      await notificationsApi.registerDevice({
        token,
        platform: Platform.OS,
        deviceId: Device.modelName || null,
      });

      console.log('[NotificationService] Registered push token:', token);
    } catch (err) {
      console.warn('[NotificationService] Failed to obtain or register push token:', err);
    }
  } else {
    console.log('[NotificationService] Must use physical device for remote push notifications');
  }

  return token;
}

/**
 * Configure foreground and notification-tap response listeners.
 */
export function setupNotificationListeners(navigationRef, onNotificationReceived) {
  // Foreground listener
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    if (typeof onNotificationReceived === 'function') {
      onNotificationReceived(notification);
    }
  });

  // Tap / Background response listener
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data || {};
    handleNotificationNavigation(navigationRef, data);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Route user to the appropriate screen based on notification payload.
 */
export function handleNotificationNavigation(navigationRef, data = {}) {
  if (!navigationRef || !navigationRef.isReady()) return;

  const { eventId, screen, focus, deepLink, tab, planId, reportId, doctorId, leaveId, expenseId } = data;

  // 1. Doctor Birthday Alert -> Today's Plan on BDM Home
  if (eventId === 'DOCTOR_BIRTHDAY_ALERT' || focus === 'todaysPlan') {
    navigationRef.navigate('HomeTab', {
      screen: 'BdmHome',
      params: { focus: 'todaysPlan', doctorId },
    });
    return;
  }

  // 2. Approvals tab navigation
  if (screen === 'ApprovalsScreen' || deepLink?.includes('approvals')) {
    navigationRef.navigate('ApprovalsTab', {
      screen: 'ApprovalsMain',
      params: { tab: tab || 'leaves', leaveId, expenseId, planId },
    });
    return;
  }

  // 3. MTP Review
  if (screen === 'MtpReviewScreen' && planId) {
    navigationRef.navigate('ApprovalsTab', {
      screen: 'MtpReview',
      params: { planId, plan: { _id: planId } },
    });
    return;
  }

  // 4. Tour Detail (BDM)
  if (screen === 'TourDetailScreen' && planId) {
    navigationRef.navigate('MtpTab', {
      screen: 'TourDetail',
      params: { planId },
    });
    return;
  }

  // 5. Leave Screen (BDM)
  if (screen === 'ApplyLeaveScreen') {
    navigationRef.navigate('MoreTab', { screen: 'ApplyLeave' });
    return;
  }

  // 6. Expenses Screen (BDM)
  if (screen === 'ExpensesScreen') {
    navigationRef.navigate('MoreTab', { screen: 'Expenses' });
    return;
  }

  // 7. Doctor Detail
  if (screen === 'DoctorDetailScreen' && doctorId) {
    navigationRef.navigate('DoctorsTab', {
      screen: 'DoctorDetail',
      params: { doctorId },
    });
    return;
  }

  // 8. DCR Review
  if (screen === 'DcrReviewDetailScreen') {
    navigationRef.navigate('MoreTab', {
      screen: 'DcrReviewDetail',
      params: { reportId, ...data },
    });
    return;
  }

  // Default fallback
  if (screen) {
    navigationRef.navigate(screen, data.params || {});
  }
}

export default {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
  handleNotificationNavigation,
};
