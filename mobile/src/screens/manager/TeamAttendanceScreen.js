import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import AttendanceSummaryCard from '../../components/attendance/AttendanceSummaryCard';
import AttendanceRow from '../../components/attendance/AttendanceRow';
import MonthlySummaryCard from '../../components/attendance/MonthlySummaryCard';
import { colors, radii, spacing, typography } from '../../theme';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' }
];

/**
 * Manager Team Attendance — the caller's own reporting subtree's BDM
 * punch/leave status (GET /api/field-force/team-attendance, already scoped
 * server-side by hierarchy + tenant).
 */
export default function TeamAttendanceScreen() {
  const [period, setPeriod] = useState('today');
  const attendance = useAsync(() => fieldForceApi.getTeamAttendance(period), [period]);
  useRefreshOnFocus(attendance.reload);

  const summary = attendance.data?.summary;
  const monthlySummary = attendance.data?.monthlySummary;
  const rows = attendance.data?.rows || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Team Attendance</Text>
        <Text style={typography.subtitle}>Punch status across your team</Text>
      </View>

      <View style={styles.filterRow}>
        {PERIODS.map((p) => (
          <Pressable key={p.value} onPress={() => setPeriod(p.value)} style={[styles.filterChip, period === p.value && styles.filterChipActive]}>
            <Text style={[styles.filterText, period === p.value && styles.filterTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {attendance.status === 'loading' && <LoadingView />}
      {attendance.status === 'error' && <ErrorBanner message={attendance.error} />}

      <AttendanceSummaryCard summary={summary} />

      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => String(item.userId)}
        ListEmptyComponent={attendance.status === 'success' ? <EmptyState icon={Users} title="No BDMs in your team" /> : null}
        ListFooterComponent={monthlySummary ? <MonthlySummaryCard monthlySummary={monthlySummary} /> : null}
        renderItem={({ item }) => <AttendanceRow item={item} period={period} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg }
});
