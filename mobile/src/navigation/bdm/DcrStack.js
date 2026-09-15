import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DcrListScreen from '../../screens/bdm/DcrListScreen';
import DcrDetailScreen from '../../screens/bdm/DcrDetailScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function DcrStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="DcrList" component={DcrListScreen} options={{ title: 'Daily Call Report' }} />
      <Stack.Screen
        name="DcrDetail"
        component={DcrDetailScreen}
        options={({ route }) => ({ title: route.params?.dcr?.doctorId?.name || route.params?.dcr?.activityName || 'Activity Detail' })}
      />
    </Stack.Navigator>
  );
}
