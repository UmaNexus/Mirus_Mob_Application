import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { resolveUserTier, isExecutiveTier } from './roleHelpers';
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
 * 'authenticated' -> a navigator chosen by the server-returned tier/role.
 * BDM -> the operational BDM tab experience; NSM and Admin/superadmin -> the
 * executive cross-tier monitoring experience; ASM/RSM/ZSM (still-operational
 * managers) -> the existing Manager tab experience, entirely unchanged. This
 * is a routing decision only — the tier/role itself is never chosen or
 * trusted from the client, and every underlying endpoint re-checks
 * authorization server-side regardless of which navigator got picked here.
 */
export default function RootNavigator() {
  const { status, user } = useAuth();

  if (status === 'booting') return <LoadingScreen />;

  const tier = resolveUserTier(user);

  const AppNavigator = tier === 'BDM'
    ? BdmTabNavigator
    : isExecutiveTier(user)
      ? ExecutiveTabNavigator
      : ManagerTabNavigator;

  useEffect(() => {
    if (status === 'authenticated') {
      registerForPushNotificationsAsync().catch(() => {});
      const unsubscribe = setupNotificationListeners(navigationRef);
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [status]);

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
