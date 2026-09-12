import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MtpScreen from '../../screens/bdm/MtpScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function MtpStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="Mtp" component={MtpScreen} options={{ title: 'Monthly Tour Plan' }} />
    </Stack.Navigator>
  );
}
