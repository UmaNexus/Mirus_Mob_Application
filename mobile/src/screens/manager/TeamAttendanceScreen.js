import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Clock, MapPin } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' }
];

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const formatTime = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

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

      {summary && (
        <Card style={styles.summaryCard}>
          <SummaryStat value={summary.totalBdms} label="Total BDMs" color={colors.ink} />
          <SummaryStat value={summary.punchedIn} label="Punched In" color={colors.success} />
          <SummaryStat value={summary.notIn} label="Not In" color={colors.danger} />
          <SummaryStat value={summary.onLeave} label="On Leave" color={colors.warning} />
        </Card>
      )}

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

function AttendanceRow({ item, period }) {
  const badge = period === 'today' ? todayBadge(item) : rangeBadge(item);
  return (
    <Card style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name || 'Unnamed'}</Text>
          <View style={styles.metaRow}>
            {item.employeeId ? <Text style={styles.meta}>{item.employeeId}</Text> : null}
            {item.territory ? (
              <View style={styles.metaWithIcon}>
                <MapPin size={iconSizes.action} color={colors.muted} />
                <Text style={styles.meta}>{item.territory}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {badge}
      </View>
      {period === 'today' && item.punchInAt ? (
        <View style={styles.metaWithIcon}>
          <Clock size={iconSizes.action} color={colors.muted} />
          <Text style={styles.meta}>Punched in at {formatTime(item.punchInAt)}</Text>
        </View>
      ) : null}
      {period !== 'today' && item.status !== 'leave' ? (
        <Text style={styles.meta}>Present {item.presentDays}/{item.workingDays} working days</Text>
      ) : null}
    </Card>
  );
}

function todayBadge(item) {
  if (item.status === 'leave') return <StatusBadge label="On Leave" tone="warning" />;
  if (item.status === 'in') return <StatusBadge label="Punched In" tone="success" />;
  return <StatusBadge label="Not In" tone="danger" />;
}

function rangeBadge(item) {
  if (item.status === 'leave') return <StatusBadge label="On Leave" tone="warning" />;
  if (item.presentDays > 0) return <StatusBadge label="Active" tone="success" />;
  return <StatusBadge label="No Punches" tone="neutral" />;
}

function SummaryStat({ value, label, color }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MonthlySummaryCard({ monthlySummary }) {
  return (
    <Card style={styles.monthlyCard}>
      <Text style={styles.monthlyTitle}>Monthly Summary</Text>
      <View style={styles.monthlyGrid}>
        <MonthlyStat value={monthlySummary.avgPunchInTime || '—'} label="Avg Punch-In" />
        <MonthlyStat value={monthlySummary.presentDaysAvg} label="Avg Present Days" />
        <MonthlyStat value={monthlySummary.workingDaysThisMonth} label="Working Days" />
        <MonthlyStat value={monthlySummary.absentWithoutReason} label="Absent (No Reason)" />
        <MonthlyStat value={monthlySummary.onApprovedLeave} label="On Approved Leave" />
      </View>
    </Card>
  );
}

function MonthlyStat({ value, label }) {
  return (
    <View style={styles.monthlyStat}>
      <Text style={styles.monthlyValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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
  summaryCard: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  summaryStat: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 2, textAlign: 'center' },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  row: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  metaWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 11, color: colors.muted },
  monthlyCard: { marginTop: spacing.sm },
  monthlyTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  monthlyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  monthlyStat: { width: '30%', alignItems: 'center' },
  monthlyValue: { fontSize: 15, fontWeight: '700', color: colors.ink }
});
