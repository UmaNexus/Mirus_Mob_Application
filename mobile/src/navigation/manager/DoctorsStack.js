import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DoctorAssignmentScreen from '../../screens/manager/DoctorAssignmentScreen';
import ImportDoctorsScreen from '../../screens/manager/ImportDoctorsScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function DoctorsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="DoctorsMain" component={DoctorAssignmentScreen} options={{ title: 'Doctor Assignments' }} />
      <Stack.Screen name="ImportDoctors" component={ImportDoctorsScreen} options={{ title: 'Bulk Import' }} />
    </Stack.Navigator>
  );
}
