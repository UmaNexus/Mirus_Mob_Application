import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Plus, ArrowLeft } from 'lucide-react-native';
import MoreScreen from '../../screens/bdm/MoreScreen';
import ExpensesScreen from '../../screens/bdm/ExpensesScreen';
import AddExpenseScreen from '../../screens/bdm/AddExpenseScreen';
import WorkTypeScreen from '../../screens/bdm/WorkTypeScreen';
import StockistsScreen from '../../screens/bdm/StockistsScreen';
import SecondarySalesScreen from '../../screens/bdm/SecondarySalesScreen';
import CalendarScreen from '../../screens/bdm/CalendarScreen';
import AlertsScreen from '../../screens/bdm/AlertsScreen';
import ApplyLeaveScreen from '../../screens/bdm/ApplyLeaveScreen';
import PrivacyPolicyScreen from '../../screens/PrivacyPolicyScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} options={{ title: 'More' }} />
      <Stack.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={({ navigation }) => ({
          title: 'Expenses',
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('MoreMenu');
                }
              }}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Back to More"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={22} color={colors.white} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => navigation.navigate('AddExpense')}
              style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Add"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          )
        })}
      />
      <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add Expense' }} />
      <Stack.Screen name="WorkType" component={WorkTypeScreen} options={{ title: 'Work Type' }} />
      <Stack.Screen name="Stockists" component={StockistsScreen} options={{ title: 'Stockists' }} />
      <Stack.Screen name="SecondarySales" component={SecondarySalesScreen} options={{ title: 'Secondary Sales' }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Status Calendar' }} />
      <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: 'Alerts' }} />
      <Stack.Screen name="ApplyLeave" component={ApplyLeaveScreen} options={{ title: 'Apply Leave' }} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    paddingRight: 12,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  backBtnPressed: {
    opacity: 0.7
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  addBtnPressed: {
    opacity: 0.7
  },
  addBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700'
  }
});
