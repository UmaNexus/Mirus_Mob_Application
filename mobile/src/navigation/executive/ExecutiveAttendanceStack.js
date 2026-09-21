import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExecutiveAttendanceScreen from '../../screens/executive/ExecutiveAttendanceScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ExecutiveAttendanceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="ExecutiveAttendanceMain" component={ExecutiveAttendanceScreen} options={{ title: 'Attendance' }} />
    </Stack.Navigator>
  );
}
