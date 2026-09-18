import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ApprovalsScreen from '../../screens/manager/ApprovalsScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ApprovalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="ApprovalsMain" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
    </Stack.Navigator>
  );
}
