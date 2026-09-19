import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, ClipboardList } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, radii, spacing, typography } from '../../theme';

const FILTERS = [
  { value: 'all', label: 'All BDMs' },
  { value: 'top', label: 'Top performers' },
  { value: 'review', label: 'Needs review' }
];

// 'top'/'active' are "on target"; 'review'/'low' are "needs review" — see
// the server's getTeamPerformance doc for the exact dcrRate thresholds.
const STATUS_LABEL = { top: 'Top', active: 'Active', review: 'Review', low: 'Low' };
const STATUS_TONE = { top: 'success', active: 'success', review: 'warning', low: 'danger' };
const BAR_COLOR = { top: colors.success, active: colors.primary, review: colors.warning, low: colors.danger };

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const monthLabel = () => new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/**
 * Manager "My Team" — per-BDM DCR/MTP/visit performance within the caller's
 * own reporting subtree (GET /api/field-force/team-performance, already
 * scoped server-side — this screen has no way to see a BDM outside it).
 */
export default function TeamScreen({ navigation }) {
  const [filter, setFilter] = useState('all');
  const performance = useAsync(fieldForceApi.getTeamPerformance, []);
  useRefreshOnFocus(performance.reload);

  const rows = useMemo(() => {
    const data = performance.data?.data || [];
    if (filter === 'top') return data.filter((d) => d.status === 'top');
    if (filter === 'review') return data.filter((d) => d.status === 'review' || d.status === 'low');
    return data;
  }, [performance.data, filter]);

  const summary = performance.data?.summary;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>My Team</Text>
        <Text style={typography.subtitle}>BDM performance · {monthLabel()}</Text>
      </View>

      {performance.status === 'loading' && <LoadingView />}
      {performance.status === 'error' && <ErrorBanner message={performance.error} />}

      {summary && (
        <Card style={styles.summaryCard}>
          <SummaryStat value={summary.totalBdms} label="Total BDMs" color={colors.ink} />
          <SummaryStat value={summary.onTarget} label="On target" color={colors.success} />
          <SummaryStat value={summary.needsReview} label="Below target" color={colors.danger} />
        </Card>
      )}

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable key={f.value} onPress={() => setFilter(f.value)} style={[styles.filterChip, filter === f.value && styles.filterChipActive]}>
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <Button
        icon={ClipboardList}
        title="View Team Attendance"
        variant="outline"
        onPress={() => navigation.navigate('TeamAttendance')}
        style={styles.attendanceBtn}
      />

      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => String(item.userId)}
        ListEmptyComponent={performance.status === 'success' ? <EmptyState icon={Users} title="No BDMs match this filter" /> : null}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name || 'Unnamed'}</Text>
                <Text style={styles.meta}>
                  DCR: {item.dcrRate}% · MTP: {item.mtpAdherence}% · Visits: {item.visitDays}/{item.workingDays}
                </Text>
              </View>
              <StatusBadge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.min(100, item.dcrRate)}%`, backgroundColor: BAR_COLOR[item.status] }]} />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

function SummaryStat({ value, label, color }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  summaryCard: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  summaryStat: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterTextActive: { color: colors.white },
  attendanceBtn: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  row: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  barTrack: { height: 5, borderRadius: radii.pill, backgroundColor: colors.surface, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radii.pill }
});
