import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExecutiveMonitorScreen from '../../screens/executive/ExecutiveMonitorScreen';
import EmployeeActivityDetailScreen from '../../screens/executive/EmployeeActivityDetailScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ExecutiveMonitorStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen
        name="ExecutiveMonitorMain"
        component={ExecutiveMonitorScreen}
        options={({ route }) => ({ title: route.params?.managerName ? `${route.params.managerName}'s team` : 'Monitor' })}
      />
      <Stack.Screen name="EmployeeActivityDetail" component={EmployeeActivityDetailScreen} options={{ title: 'Activity' }} />
    </Stack.Navigator>
  );
}
