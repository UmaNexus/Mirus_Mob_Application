import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { House, ClipboardList, CalendarDays, Stethoscope, MoreHorizontal } from 'lucide-react-native';
import HomeStack from './HomeStack';
import DcrStack from './DcrStack';
import MtpStack from './MtpStack';
import DoctorsStack from './DoctorsStack';
import MoreStack from './MoreStack';
import { colors, iconSizes } from '../../theme';

const Tab = createBottomTabNavigator();

const ICONS = { HomeTab: House, DcrTab: ClipboardList, MtpTab: CalendarDays, DoctorsTab: Stethoscope, MoreTab: MoreHorizontal };

/** BDM's bottom navigation — Home / DCR / MTP / Doctors / More. */
export default function BdmTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color }) => {
          const Icon = ICONS[route.name];
          return <Icon size={iconSizes.tabBar} color={color} strokeWidth={2} />;
        }
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
