import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreScreen from '../../screens/bdm/MoreScreen';
import ExpensesScreen from '../../screens/bdm/ExpensesScreen';
import AddExpenseScreen from '../../screens/bdm/AddExpenseScreen';
import WorkTypeScreen from '../../screens/bdm/WorkTypeScreen';
import StockistsScreen from '../../screens/bdm/StockistsScreen';
import SecondarySalesScreen from '../../screens/bdm/SecondarySalesScreen';
import CalendarScreen from '../../screens/bdm/CalendarScreen';
import AlertsScreen from '../../screens/bdm/AlertsScreen';
import ApplyLeaveScreen from '../../screens/bdm/ApplyLeaveScreen';
import { colors } from '../../theme';

const Stack = createNativeStackNavigator();

export default function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.ink }, headerTintColor: colors.white }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} options={{ title: 'More' }} />
      <Stack.Screen name="Expenses" component={ExpensesScreen} options={{ title: 'Expenses' }} />
      <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add Expense' }} />
      <Stack.Screen name="WorkType" component={WorkTypeScreen} options={{ title: 'Work Type' }} />
      <Stack.Screen name="Stockists" component={StockistsScreen} options={{ title: 'Stockists' }} />
      <Stack.Screen name="SecondarySales" component={SecondarySalesScreen} options={{ title: 'Secondary Sales' }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Status Calendar' }} />
      <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: 'Alerts' }} />
      <Stack.Screen name="ApplyLeave" component={ApplyLeaveScreen} options={{ title: 'Apply Leave' }} />
    </Stack.Navigator>
  );
}
