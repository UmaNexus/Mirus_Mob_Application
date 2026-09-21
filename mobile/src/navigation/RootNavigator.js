import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { resolveUserTier, isExecutiveTier } from './roleHelpers';
import LoadingScreen from '../screens/LoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import BdmTabNavigator from './bdm/BdmTabNavigator';
import ManagerTabNavigator from './manager/ManagerTabNavigator';
import ExecutiveTabNavigator from './executive/ExecutiveTabNavigator';


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

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'authenticated' ? (
          <Stack.Screen name="App" component={AppNavigator} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
