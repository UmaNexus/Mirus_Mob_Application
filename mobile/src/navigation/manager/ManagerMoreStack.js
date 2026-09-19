import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ManagerMoreScreen from '../../screens/manager/ManagerMoreScreen';
import DcrReviewScreen from '../../screens/manager/DcrReviewScreen';
import DcrReviewDetailScreen from '../../screens/manager/DcrReviewDetailScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function ManagerMoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="ManagerMoreMain" component={ManagerMoreScreen} options={{ title: 'More' }} />
      <Stack.Screen name="DcrReview" component={DcrReviewScreen} options={{ title: 'DCR Review' }} />
      <Stack.Screen name="DcrReviewDetail" component={DcrReviewDetailScreen} options={{ title: 'Daily Report' }} />
    </Stack.Navigator>
  );
}
