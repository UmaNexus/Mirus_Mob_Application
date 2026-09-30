import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../../screens/HomeScreen';
import AlertsScreen from '../../screens/bdm/AlertsScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ManagerHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'MIRUS' }} />
      <Stack.Screen name="Notifications" component={AlertsScreen} options={{ title: 'Notifications' }} />
    </Stack.Navigator>
  );
}
