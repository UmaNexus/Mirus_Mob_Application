import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExecutiveReportsScreen from '../../screens/executive/ExecutiveReportsScreen';
import ReportDetailScreen from '../../screens/executive/ReportDetailScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ExecutiveReportsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="ExecutiveReportsMain" component={ExecutiveReportsScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={({ route }) => ({ title: route.params?.title || 'Report' })} />
    </Stack.Navigator>
  );
}
