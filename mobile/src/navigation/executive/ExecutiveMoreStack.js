import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExecutiveMoreScreen from '../../screens/executive/ExecutiveMoreScreen';
import CalendarScreen from '../../screens/bdm/CalendarScreen';
import PrivacyPolicyScreen from '../../screens/PrivacyPolicyScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ExecutiveMoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="ExecutiveMoreMain" component={ExecutiveMoreScreen} options={{ title: 'More' }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Status Calendar' }} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
