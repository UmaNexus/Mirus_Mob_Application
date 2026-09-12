import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BdmHomeScreen from '../../screens/bdm/BdmHomeScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="BdmHome" component={BdmHomeScreen} options={{ title: 'Home' }} />
    </Stack.Navigator>
  );
}
