import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BdmHomeScreen from '../../screens/bdm/BdmHomeScreen';
import ApplyLeaveScreen from '../../screens/bdm/ApplyLeaveScreen';
import DoctorDetailScreen from '../../screens/bdm/DoctorDetailScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="BdmHome" component={BdmHomeScreen} options={{ title: 'Home' }} />
      <Stack.Screen name="ApplyLeave" component={ApplyLeaveScreen} options={{ title: 'Apply Leave' }} />
      <Stack.Screen
        name="DoctorDetail"
        component={DoctorDetailScreen}
        options={({ route }) => ({ title: route.params?.doctor?.name || 'Doctor' })}
      />
    </Stack.Navigator>
  );
}
