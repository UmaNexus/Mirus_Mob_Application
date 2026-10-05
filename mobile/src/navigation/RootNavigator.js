import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { isLeafUser, isExecutiveTier, hasFieldAccess } from './roleHelpers';
import NoFieldRoleScreen from '../screens/NoFieldRoleScreen';
import LoadingScreen from '../screens/LoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import BdmTabNavigator from './bdm/BdmTabNavigator';
import ManagerTabNavigator from './manager/ManagerTabNavigator';
import ExecutiveTabNavigator from './executive/ExecutiveTabNavigator';
import linking from './linking';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '../services/notificationService';

export const navigationRef = createNavigationContainerRef();

const Stack = createNativeStackNavigator();

/**
 * Auth-gated root: 'booting' -> loader, 'unauthenticated' -> login,
 * 'authenticated' -> a navigator chosen by the server-returned JobRole access
 * (fieldAccess). Field rep -> the operational BDM tab experience; executive roles and
 * Admin/superadmin -> the executive monitoring experience; other manager roles -> the
 * Manager tab experience; no valid field role -> a "no role" screen. This
 * is a routing decision only — the role itself is never chosen or
 * trusted from the client, and every underlying endpoint re-checks
 * authorization server-side regardless of which navigator got picked here.
 */
export default function RootNavigator() {
  const { status, user } = useAuth();
  
    useEffect(() => {
      if (status === 'authenticated') {
        registerForPushNotificationsAsync().catch(() => {});
        const unsubscribe = setupNotificationListeners(navigationRef);
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }
    }, [status]);

  if (status === 'booting') return <LoadingScreen />;

  // Chosen from the server-resolved JobRole (fieldAccess). A user without a valid field role
  // gets a clean "no role" screen instead of a navigator whose endpoints would all answer 403.
  const AppNavigator = !hasFieldAccess(user)
    ? NoFieldRoleScreen
    : isLeafUser(user)
      ? BdmTabNavigator
      : isExecutiveTier(user)
        ? ExecutiveTabNavigator
        : ManagerTabNavigator;

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'authenticated' ? (
          <Stack.Screen name="App" component={AppNavigator} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
