import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as expensesApi from '../../api/expenses';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../theme';

const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' };
const rupees = (paisa) => `₹${Math.round(paisa / 100).toLocaleString('en-IN')}`;

export default function ExpensesScreen({ navigation }) {
  const expenses = useAsync(() => expensesApi.listMine(), []);
  useRefreshOnFocus(expenses.reload);
  const total = (expenses.data || []).reduce((sum, e) => sum + e.amount, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={typography.title}>Expenses</Text>
          <Text style={typography.subtitle}>TA / DA claims</Text>
        </View>
        <Button title="+ Add" variant="ghost" onPress={() => navigation.navigate('AddExpense')} />
      </View>

      {expenses.status === 'loading' && <LoadingView />}
      {expenses.status === 'error' && <ErrorBanner message={expenses.error} />}
      {expenses.status === 'success' && (
        <Card style={styles.summary}>
          <Text style={styles.summaryLabel}>Total claimed</Text>
          <Text style={styles.summaryValue}>{rupees(total)}</Text>
        </Card>
      )}

      <FlatList
        contentContainerStyle={styles.list}
        data={expenses.data || []}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={expenses.status === 'success' ? <EmptyState icon="💰" title="No expenses yet" /> : null}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.category}>{item.category}</Text>
              <StatusBadge label={item.status} tone={TONE[item.status]} />
            </View>
            <Text style={styles.meta}>{new Date(item.date).toLocaleDateString()}{item.from ? ` · ${item.from} → ${item.to}` : ''}</Text>
            <Text style={styles.amount}>{rupees(item.amount)}</Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  summary: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.ink },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  summaryValue: { color: colors.white, fontSize: 22, fontWeight: '700', marginTop: 2 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: { gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  amount: { fontSize: 15, fontWeight: '700', color: colors.ink }
});
