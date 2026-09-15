import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { resolveUserTier } from './roleHelpers';
import LoadingScreen from '../screens/LoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import BdmTabNavigator from './bdm/BdmTabNavigator';
import ManagerStack from './manager/ManagerStack';

const Stack = createNativeStackNavigator();

/**
 * Auth-gated root: 'booting' -> loader, 'unauthenticated' -> login,
 * 'authenticated' -> a navigator chosen by the server-returned tier.
 * BDM gets the real Milestone 6 tab experience; every other tier
 * (ASM/RSM/ZSM/NSM/Admin) still gets the Milestone 5 placeholder until
 * Milestones 7-8 build their real navigators — this is a routing decision
 * only, the tier itself is never chosen or trusted from the client.
 */
export default function RootNavigator() {
  const { status, user } = useAuth();

  if (status === 'booting') return <LoadingScreen />;

  const tier = resolveUserTier(user);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'authenticated' ? (
          tier === 'BDM' ? (
            <Stack.Screen name="BdmApp" component={BdmTabNavigator} />
          ) : (
            <Stack.Screen name="ManagerApp" component={ManagerStack} />
          )
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
