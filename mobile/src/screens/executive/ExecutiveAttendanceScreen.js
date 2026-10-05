import React, { useMemo, useState } from 'react';
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
 * Executive Attendance — a flat, per-tier attendance list across the
 * caller's WHOLE authorized scope (own subtree, or company-wide for
 * admin/superadmin) — not drilled level-by-level like the Monitor tab.
 * GET /api/field-force/team-attendance, generalized with a `tier` param.
 */
export default function ExecutiveAttendanceScreen() {
  // Chips come from the roles that actually exist in the caller's scope (server roleCounts,
  // by JobRole) — no role names or ladder are hard-coded in the app.
  const orgSummary = useAsync(() => fieldForceApi.getOrgSummary(), []);
  const roles = useMemo(
    () => (orgSummary.data?.roleCounts || []).map((r) => ({ key: r.jobRoleId, jobRoleId: r.jobRoleId, name: r.name })),
    [orgSummary.data]
  );

  const [period, setPeriod] = useState('today');
  const [selectedKey, setSelectedKey] = useState(null);
  const selected = roles.find((r) => r.key === selectedKey) || roles[0] || null;
  const tier = selected?.name || 'Employee';

  const attendance = useAsync(
    () => (selected ? fieldForceApi.getTeamAttendance(period, selected.jobRoleId) : Promise.resolve(null)),
    [period, selected?.key]
  );
  useRefreshOnFocus(attendance.reload);

  const summary = attendance.data?.summary;
  const monthlySummary = attendance.data?.monthlySummary;
  const rows = attendance.data?.rows || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Attendance</Text>
        <Text style={typography.subtitle}>Punch status across the organization</Text>
      </View>

      <View style={styles.chipRow}>
        {roles.map((r) => (
          <Pressable key={r.key} onPress={() => setSelectedKey(r.key)} style={[styles.chip, selected?.key === r.key && styles.chipActive]}>
            <Text style={[styles.chipText, selected?.key === r.key && styles.chipTextActive]}>{r.name}</Text>
          </Pressable>
        ))}
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

      <AttendanceSummaryCard summary={summary} totalLabel={`Total ${tier}`} />

      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => String(item.userId)}
        ListEmptyComponent={attendance.status === 'success' ? <EmptyState icon={Users} title={`No ${tier} in this scope`} /> : null}
        ListFooterComponent={monthlySummary ? <MonthlySummaryCard monthlySummary={monthlySummary} /> : null}
        renderItem={({ item }) => <AttendanceRow item={item} period={period} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  chipTextActive: { color: colors.white },
  filterRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg }
});
