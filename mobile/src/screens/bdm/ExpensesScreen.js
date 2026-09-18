import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Receipt, RotateCcw, CalendarDays } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as expensesApi from '../../api/expenses';
import Card from '../../components/Card';
import Button from '../../components/Button';
import DateField from '../../components/DateField';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, radii } from '../../theme';

const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' };
const rupees = (paisa) => `₹${Math.round(paisa / 100).toLocaleString('en-IN')}`;

const CATEGORY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Travel', value: 'Travel' },
  { label: 'Food', value: 'Food' },
  { label: 'Stay', value: 'Stay' },
  { label: 'Misc', value: 'Misc' }
];

export default function ExpensesScreen({ navigation }) {
  const [category, setCategory] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const expenses = useAsync(expensesApi.listMine, []);
  useRefreshOnFocus(expenses.reload);

  const isFiltered = category !== 'all' || Boolean(fromDate) || Boolean(toDate);

  const filteredExpenses = useMemo(() => {
    const list = expenses.data || [];
    return list.filter((item) => {
      if (category !== 'all' && item.category !== category) {
        return false;
      }
      if (fromDate || toDate) {
        const itemDateStr = item.date ? new Date(item.date).toISOString().slice(0, 10) : '';
        if (fromDate && itemDateStr < fromDate) {
          return false;
        }
        if (toDate && itemDateStr > toDate) {
          return false;
        }
      }
      return true;
    });
  }, [expenses.data, category, fromDate, toDate]);

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleResetFilters = () => {
    setCategory('all');
    setFromDate('');
    setToDate('');
  };

  const durationLabel = useMemo(() => {
    if (fromDate && toDate) return `${fromDate} → ${toDate}`;
    if (fromDate) return `From ${fromDate}`;
    if (toDate) return `Up to ${toDate}`;
    return null;
  }, [fromDate, toDate]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Filter Section */}
      <View style={styles.filterSection}>
        {/* Category Pills featuring Travel, Food, Stay, Misc */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChips}
        >
          {CATEGORY_FILTERS.map((cat) => {
            const isSelected = category === cat.value;
            return (
              <Pressable
                key={cat.value}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => setCategory(cat.value)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Date Range Filters */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <DateField
              label="From date"
              value={fromDate}
              onChange={setFromDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.dateCol}>
            <DateField
              label="To date"
              value={toDate}
              onChange={setToDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        {fromDate && toDate && fromDate > toDate ? (
          <Text style={styles.dateErrorText}>From date cannot be after To date</Text>
        ) : null}

        {/* Reset Button for filters */}
        <Button
          icon={RotateCcw}
          title="Reset filters"
          variant="outline"
          disabled={!isFiltered}
          onPress={handleResetFilters}
          style={[styles.resetButton, isFiltered && styles.resetButtonActive]}
        />
      </View>

      {/* Card in between filter and expense entries displaying total expenses for selected duration */}
      {Boolean(expenses.data) && (
        <Card style={styles.durationCard}>
          <View style={styles.durationCardHeader}>
            <View style={styles.durationLabelContainer}>
              <CalendarDays size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.durationLabel}>
                {fromDate || toDate ? 'Total for selected duration' : 'Total expenses'}
              </Text>
            </View>
            {durationLabel ? (
              <View style={styles.durationPill}>
                <Text style={styles.durationPillText}>{durationLabel}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.durationValueRow}>
            <Text style={styles.durationValue}>{rupees(total)}</Text>
            <Text style={styles.durationCount}>
              {filteredExpenses.length} {filteredExpenses.length === 1 ? 'claim' : 'claims'}
              {category !== 'all' ? ` · ${category}` : ''}
            </Text>
          </View>
        </Card>
      )}

      {expenses.status === 'loading' && !expenses.data && <LoadingView />}
      {expenses.status === 'error' && <ErrorBanner message={expenses.error} />}

      <FlatList
        contentContainerStyle={styles.list}
        data={filteredExpenses}
        keyExtractor={(item) => item._id}
        refreshControl={<RefreshControl refreshing={expenses.status === 'loading' && Boolean(expenses.data)} onRefresh={expenses.reload} />}
        ListEmptyComponent={
          expenses.status === 'success' || expenses.data ? (
            isFiltered ? (
              <EmptyState
                icon={Receipt}
                title="No matching expenses"
                subtitle="Try adjusting your category or date range filter."
              />
            ) : (
              <EmptyState
                icon={Receipt}
                title="No expenses yet"
                subtitle="Tap + Add to submit your first claim."
              />
            )
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.category}>{item.category}</Text>
              <StatusBadge label={item.status} tone={TONE[item.status]} />
            </View>
            <Text style={styles.meta}>
              {new Date(item.date).toLocaleDateString()}
              {item.from ? ` · ${item.from} → ${item.to}` : ''}
            </Text>
            <Text style={styles.amount}>{rupees(item.amount)}</Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  durationCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs
  },
  durationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  durationLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  durationLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500'
  },
  durationPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill
  },
  durationPillText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600'
  },
  durationValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 2
  },
  durationValue: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '700'
  },
  durationCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500'
  },
  filterSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm
  },
  categoryChips: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: 2
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink
  },
  chipTextSelected: {
    color: colors.white
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  dateCol: {
    flex: 1
  },
  dateErrorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: -spacing.xs / 2
  },
  resetButton: {
    minHeight: 40,
    marginTop: spacing.xs / 2,
    borderColor: colors.line,
    backgroundColor: colors.card
  },
  resetButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: { gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  amount: { fontSize: 15, fontWeight: '700', color: colors.ink }
});
