import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExecutiveHomeScreen from '../../screens/executive/ExecutiveHomeScreen';
import AlertsScreen from '../../screens/bdm/AlertsScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ExecutiveHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="ExecutiveHomeMain" component={ExecutiveHomeScreen} options={{ title: 'MIRUS' }} />
      <Stack.Screen name="Notifications" component={AlertsScreen} options={{ title: 'Notifications' }} />
    </Stack.Navigator>
  );
}
