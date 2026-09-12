import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DoctorsScreen from '../../screens/bdm/DoctorsScreen';
import DoctorDetailScreen from '../../screens/bdm/DoctorDetailScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function DoctorsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="DoctorsList" component={DoctorsScreen} options={{ title: 'Doctors' }} />
      <Stack.Screen
        name="DoctorDetail"
        component={DoctorDetailScreen}
        options={({ route }) => ({ title: route.params?.doctor?.name || 'Doctor' })}
      />
    </Stack.Navigator>
  );
}
