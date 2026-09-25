import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { House, CalendarCheck, Monitor, BarChart3, MoreHorizontal } from 'lucide-react-native';
import ExecutiveHomeStack from './ExecutiveHomeStack';
import ExecutiveAttendanceStack from './ExecutiveAttendanceStack';
import ExecutiveMonitorStack from './ExecutiveMonitorStack';
import ExecutiveReportsStack from './ExecutiveReportsStack';
import ExecutiveMoreStack from './ExecutiveMoreStack';
import { colors, iconSizes } from '../../theme';

const Tab = createBottomTabNavigator();

const ICONS = {
  ExecutiveHomeTab: House,
  ExecutiveAttendanceTab: CalendarCheck,
  ExecutiveMonitorTab: Monitor,
  ExecutiveReportsTab: BarChart3,
  ExecutiveMoreTab: MoreHorizontal
};

/**
 * Executive bottom navigation — Home / Attendance / Monitor / Reports / More.
 * Used by NSM (own ZSM->RSM->ASM->BDM subtree) and Admin/superadmin
 * (company-wide) — see `roleHelpers.isExecutiveTier` / `RootNavigator`. A
 * distinct tree from `ManagerTabNavigator` (ASM/RSM/ZSM keep their existing
 * "my direct-report BDMs" Home/Approvals/Team/Doctors/More experience
 * entirely unchanged) — this is read-only, cross-tier monitoring, never an
 * approval workflow.
 */
export default function ExecutiveTabNavigator() {
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
      <Tab.Screen name="ExecutiveHomeTab" component={ExecutiveHomeStack} options={{ title: 'Home' }} />
      <Tab.Screen name="ExecutiveAttendanceTab" component={ExecutiveAttendanceStack} options={{ title: 'Attendance' }} />
      <Tab.Screen name="ExecutiveMonitorTab" component={ExecutiveMonitorStack} options={{ title: 'Monitor' }} />
      <Tab.Screen name="ExecutiveReportsTab" component={ExecutiveReportsStack} options={{ title: 'Reports' }} />
      <Tab.Screen
        name="ExecutiveMoreTab"
        component={ExecutiveMoreStack}
        options={{ title: 'More' }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const currentRoute = state?.routes?.[state?.index];
            const isAlreadyOnMore = currentRoute?.name === 'ExecutiveMoreTab';
            const moreRoute = isAlreadyOnMore ? currentRoute : state?.routes?.find((r) => r.name === 'ExecutiveMoreTab');

            if (moreRoute?.state?.key) {
              if (isAlreadyOnMore) {
                e.preventDefault();
              }
              navigation.dispatch({
                ...CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'ExecutiveMoreMain' }]
                }),
                target: moreRoute.state.key
              });
            } else {
              navigation.navigate('ExecutiveMoreTab', { screen: 'ExecutiveMoreMain' });
            }
          }
        })}
      />
    </Tab.Navigator>
  );
}
