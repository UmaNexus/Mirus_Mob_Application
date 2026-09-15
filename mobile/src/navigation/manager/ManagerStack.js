import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../../screens/HomeScreen';
import DoctorAssignmentScreen from '../../screens/manager/DoctorAssignmentScreen';
import ImportDoctorsScreen from '../../screens/manager/ImportDoctorsScreen';
import TeamMtpScreen from '../../screens/manager/TeamMtpScreen';
import MtpReviewScreen from '../../screens/manager/MtpReviewScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

/**
 * Minimal manager-side navigator — only the screens the MTP workflow needs
 * (doctor assignment + bulk import + team MTP review). A full manager
 * dashboard/tab-bar is out of scope here (Milestone 7); every non-BDM tier
 * still lands on the same foundation HomeScreen, which now also offers these
 * two entry points when the signed-in user's tier/role qualifies.
 */
export default function ManagerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'MIRUS' }} />
      <Stack.Screen name="DoctorAssignment" component={DoctorAssignmentScreen} options={{ title: 'Doctor Assignments' }} />
      <Stack.Screen name="ImportDoctors" component={ImportDoctorsScreen} options={{ title: 'Bulk Import' }} />
      <Stack.Screen name="TeamMtp" component={TeamMtpScreen} options={{ title: 'Team MTP' }} />
      <Stack.Screen name="MtpReview" component={MtpReviewScreen} options={({ route }) => ({ title: route.params?.bdmName || 'Monthly Tour Plan' })} />
    </Stack.Navigator>
  );
}
