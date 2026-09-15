import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MtpScreen from '../../screens/bdm/MtpScreen';
import TourDetailScreen from '../../screens/bdm/TourDetailScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function MtpStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="Mtp" component={MtpScreen} options={{ title: 'Monthly Tour Plan' }} />
      <Stack.Screen name="TourDetail" component={TourDetailScreen} options={({ route }) => ({ title: route.params?.plan ? 'Tour Details' : 'New Tour' })} />
    </Stack.Navigator>
  );
}
