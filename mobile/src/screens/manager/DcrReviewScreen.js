import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardList, Send, FileClock } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as dcrApi from '../../api/dcr';
import { displayName } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, radii, spacing, typography } from '../../theme';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' }
];

// Mirrors DcrListScreen's own derived report-status concept: a Daily DCR has
// no stored day-level status — it is derived from whether none/some/all of
// its rows carry submittedAt. Applied here per BDM+date group.
const deriveReportStatus = (rows) => {
  const submittedCount = rows.filter((r) => r.submittedAt).length;
  if (submittedCount === 0) return 'draft';
  if (submittedCount === rows.length) return 'submitted';
  return 'needsResubmission';
};
const REPORT_STATUS_LABEL = { draft: 'Draft', submitted: 'Submitted', needsResubmission: 'Needs Resubmission' };
const REPORT_STATUS_TONE = { draft: 'neutral', submitted: 'success', needsResubmission: 'warning' };

const dateLabel = (dateKey) => new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/**
 * Manager DCR Review — read-only view of the caller's reporting subtree's
 * daily call reports (GET /api/dcr/team, already scoped server-side by
 * hierarchy + tenant). Rows are grouped here by BDM+date into one card per
 * daily report; the same rows are passed straight to the detail screen
 * rather than re-fetching, since the list call already carries everything a
 * detail view needs.
 */
export default function DcrReviewScreen({ navigation }) {
  const [period, setPeriod] = useState('today');
  const dcrs = useAsync(() => dcrApi.listTeam(period), [period]);
  useRefreshOnFocus(dcrs.reload);

  const reports = useMemo(() => {
    const rows = dcrs.data || [];
    const groups = new Map();
    for (const row of rows) {
      const bdmId = row.userId?._id || row.userId;
      const key = `${bdmId}|${row.dateKey}`;
      if (!groups.has(key)) groups.set(key, { key, bdm: row.userId, dateKey: row.dateKey, rows: [] });
      groups.get(key).rows.push(row);
    }
    return [...groups.values()]
      .map((g) => {
        const completed = g.rows.filter((r) => r.status === 'completed').length;
        const pending = g.rows.filter((r) => r.status === 'pending').length;
        const missed = g.rows.filter((r) => r.status === 'missed').length;
        const reportStatus = deriveReportStatus(g.rows);
        const submittedTimes = g.rows.filter((r) => r.submittedAt).map((r) => new Date(r.submittedAt).getTime());
        const submittedAt = submittedTimes.length ? new Date(Math.max(...submittedTimes)).toISOString() : null;
        return { ...g, total: g.rows.length, completed, pending, missed, reportStatus, submittedAt };
      })
      .sort((a, b) => (a.dateKey === b.dateKey ? 0 : a.dateKey < b.dateKey ? 1 : -1));
  }, [dcrs.data]);

  const openReport = (report) => navigation.navigate('DcrReviewDetail', { report });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>DCR Review</Text>
        <Text style={typography.subtitle}>Your team's submitted daily call reports</Text>
      </View>

      <View style={styles.filterRow}>
        {PERIODS.map((p) => (
          <Pressable key={p.value} onPress={() => setPeriod(p.value)} style={[styles.filterChip, period === p.value && styles.filterChipActive]}>
            <Text style={[styles.filterText, period === p.value && styles.filterTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {dcrs.status === 'loading' && <LoadingView />}
      {dcrs.status === 'error' && <ErrorBanner message={dcrs.error} />}

      <FlatList
        contentContainerStyle={styles.list}
        data={reports}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={dcrs.status === 'success' ? <EmptyState icon={ClipboardList} title="No DCR activity in this period" /> : null}
        renderItem={({ item }) => (
          <Card style={styles.row} onPress={() => openReport(item)}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bdmName}>{displayName(item.bdm)}</Text>
                <Text style={styles.meta}>
                  {item.bdm?.employeeDetails?.employeeId || 'No Employee ID'} · {dateLabel(item.dateKey)}
                </Text>
              </View>
              <StatusBadge label={REPORT_STATUS_LABEL[item.reportStatus]} tone={REPORT_STATUS_TONE[item.reportStatus]} />
            </View>
            <View style={styles.countsRow}>
              <CountStat value={item.total} label="Calls" />
              <CountStat value={item.completed} label="Completed" color={colors.success} />
              <CountStat value={item.pending} label="Pending" color={colors.warning} />
              <CountStat value={item.missed} label="Missed" color={colors.danger} />
            </View>
            {item.submittedAt ? (
              <View style={styles.submittedRow}>
                <Send size={12} color={colors.muted} />
                <Text style={styles.meta}>Submitted at {timeLabel(item.submittedAt)}</Text>
              </View>
            ) : (
              <View style={styles.submittedRow}>
                <FileClock size={12} color={colors.muted} />
                <Text style={styles.meta}>Not yet submitted</Text>
              </View>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

function CountStat({ value, label, color = colors.ink }) {
  return (
    <View style={styles.countStat}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
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
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  row: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bdmName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  countsRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  countStat: { alignItems: 'center', flex: 1 },
  countValue: { fontSize: 15, fontWeight: '700' },
  countLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  submittedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }
});
