import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeStack from './HomeStack';
import DcrStack from './DcrStack';
import MtpStack from './MtpStack';
import DoctorsStack from './DoctorsStack';
import MoreStack from './MoreStack';
import { colors } from '../../theme';

const Tab = createBottomTabNavigator();

const ICONS = { HomeTab: '🏠', DcrTab: '📋', MtpTab: '📅', DoctorsTab: '👨‍⚕️', MoreTab: '⋯' };

/** BDM's bottom navigation — Home / DCR / MTP / Doctors / More, matching the demo's structure. */
export default function BdmTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{ICONS[route.name]}</Text>
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: 'Home' }} />
      <Tab.Screen name="DcrTab" component={DcrStack} options={{ title: 'DCR' }} />
      <Tab.Screen name="MtpTab" component={MtpStack} options={{ title: 'MTP' }} />
      <Tab.Screen name="DoctorsTab" component={DoctorsStack} options={{ title: 'Doctors' }} />
      <Tab.Screen name="MoreTab" component={MoreStack} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}
