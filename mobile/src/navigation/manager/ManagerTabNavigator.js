import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { House, CheckCheck, Users, Stethoscope, MoreHorizontal } from 'lucide-react-native';
import ManagerHomeStack from './ManagerHomeStack';
import ApprovalsStack from './ApprovalsStack';
import TeamStack from './TeamStack';
import DoctorsStack from './DoctorsStack';
import ManagerMoreStack from './ManagerMoreStack';
import { colors, iconSizes } from '../../theme';

const Tab = createBottomTabNavigator();

const ICONS = {
  HomeTab: House,
  ApprovalsTab: CheckCheck,
  TeamTab: Users,
  DoctorsTab: Stethoscope,
  MoreTab: MoreHorizontal
};

/** Manager bottom navigation — Home / Approvals / Team / Doctors / More. */
export default function ManagerTabNavigator() {
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
      <Tab.Screen name="HomeTab" component={ManagerHomeStack} options={{ title: 'Home' }} />
      <Tab.Screen name="ApprovalsTab" component={ApprovalsStack} options={{ title: 'Approvals' }} />
      <Tab.Screen name="TeamTab" component={TeamStack} options={{ title: 'Team' }} />
      <Tab.Screen name="DoctorsTab" component={DoctorsStack} options={{ title: 'Doctors' }} />
      <Tab.Screen
        name="MoreTab"
        component={ManagerMoreStack}
        options={{ title: 'More' }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const currentRoute = state?.routes?.[state?.index];
            const isAlreadyOnMore = currentRoute?.name === 'MoreTab';
            const moreRoute = isAlreadyOnMore ? currentRoute : state?.routes?.find((r) => r.name === 'MoreTab');

            if (moreRoute?.state?.key) {
              if (isAlreadyOnMore) {
                e.preventDefault();
              }
              navigation.dispatch({
                ...CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'ManagerMoreMain' }]
                }),
                target: moreRoute.state.key
              });
            } else {
              navigation.navigate('MoreTab', { screen: 'ManagerMoreMain' });
            }
          }
        })}
      />
    </Tab.Navigator>
  );
}
