import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TeamScreen from '../../screens/manager/TeamScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function TeamStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="TeamMain" component={TeamScreen} options={{ title: 'Team' }} />
    </Stack.Navigator>
  );
}
