import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DcrListScreen from '../../screens/bdm/DcrListScreen';
import DcrFormScreen from '../../screens/bdm/DcrFormScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();
const FORM_TITLES = { individual: 'Log Individual Call', joint: 'Log Joint Call', missed: 'Mark Missed Visit' };

export default function DcrStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="DcrList" component={DcrListScreen} options={{ title: 'Daily Call Report' }} />
      <Stack.Screen
        name="DcrForm"
        component={DcrFormScreen}
        options={({ route }) => ({ title: FORM_TITLES[route.params?.type] || 'Log Call' })}
      />
    </Stack.Navigator>
  );
}
