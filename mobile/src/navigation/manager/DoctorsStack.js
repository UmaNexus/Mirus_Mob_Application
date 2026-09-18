import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ManagerDoctorsScreen from '../../screens/manager/ManagerDoctorsScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function DoctorsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="DoctorsMain" component={ManagerDoctorsScreen} options={{ title: 'Doctors' }} />
    </Stack.Navigator>
  );
}
