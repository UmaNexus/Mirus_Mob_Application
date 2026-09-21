import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardList, MapPinned, CalendarCheck, Stethoscope, Wallet, Umbrella, Package, Route, ChevronRight } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';

const PERIODS = () => {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) },
    { value: 'quarter', label: `Q${q} ${now.getFullYear()}` },
    { value: 'ytd', label: 'YTD' }
  ];
};

const REPORTS = [
  { type: 'dcr', title: 'DCR Report', icon: ClipboardList },
  { type: 'mtp', title: 'MTP Report', icon: MapPinned },
  { type: 'attendance', title: 'Attendance Report', icon: CalendarCheck },
  { type: 'doctors', title: 'Doctor Coverage Report', icon: Stethoscope },
  { type: 'expenses', title: 'Expense Report', icon: Wallet },
  { type: 'leaves', title: 'Leave Report', icon: Umbrella },
  { type: 'secondarySales', title: 'Secondary Sales Report', icon: Package },
  { type: 'fieldActivity', title: 'Field Activity Report', icon: Route }
];

/**
 * Executive Reports — period selector + "key numbers" (GET
 * /api/field-force/reports-summary) and one navigation row per report,
 * each pushing `ReportDetailScreen` which reuses the already-existing,
 * already-scoped `/dcr/team`, `/mtp/team`, `/expenses/team`, `/leaves`,
 * `/doctors`, `/stockists/team`, `/secondary-sales/team` list endpoints —
 * this screen only powers the summary numbers, read-only throughout.
 */
export default function ExecutiveReportsScreen({ navigation }) {
  const periods = useMemo(() => PERIODS(), []);
  const [period, setPeriod] = useState('month');

  const summary = useAsync(() => fieldForceApi.getReportsSummary(period), [period]);
  useRefreshOnFocus(summary.reload);
  const current = summary.data?.current;
  const previous = summary.data?.previous;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Reports</Text>
        <Text style={typography.subtitle}>Company-wide analytics</Text>
      </View>

      <ScrollView>
        <View style={styles.filterRow}>
          {periods.map((p) => (
            <Pressable key={p.value} onPress={() => setPeriod(p.value)} style={[styles.filterChip, period === p.value && styles.filterChipActive]}>
              <Text style={[styles.filterText, period === p.value && styles.filterTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[typography.label, styles.sectionLabel]}>Summary reports</Text>
        <View style={styles.reportGrid}>
          {REPORTS.map((r) => (
            <Pressable key={r.type} onPress={() => navigation.navigate('ReportDetail', { type: r.type, title: r.title, period })} style={styles.reportTile}>
              <Card style={styles.reportCard}>
                <r.icon size={iconSizes.header} color={colors.primary} />
                <Text style={styles.reportTitle}>{r.title}</Text>
                <ChevronRight size={iconSizes.action} color={colors.muted} style={styles.reportChevron} />
              </Card>
            </Pressable>
          ))}
        </View>

        {summary.status === 'loading' && <LoadingView />}
        {summary.status === 'error' && <ErrorBanner message={summary.error} />}

        {current && (
          <>
            <Text style={[typography.label, styles.sectionLabel]}>Key numbers — {periods.find((p) => p.value === period)?.label}</Text>
            <Card style={styles.numbersCard}>
              <NumberRow label="Total DCRs submitted" value={current.dcrSubmittedCount} prev={previous?.dcrSubmittedCount} />
              <NumberRow label="Field visits" value={current.fieldVisitsCount} prev={previous?.fieldVisitsCount} />
              <NumberRow label="MTPs approved" value={current.mtpApprovedCount} prev={previous?.mtpApprovedCount} />
              <NumberRow label="MTPs pending" value={current.mtpPendingCount} prev={previous?.mtpPendingCount} />
              <NumberRow label="Doctor coverage" value={`${current.doctorCoveragePct}%`} />
              <NumberRow label="Expense claims" value={current.expenseClaimsCount} prev={previous?.expenseClaimsCount} />
              <NumberRow label="Total expenses" value={`₹${current.expenseTotal}`} prev={previous?.expenseTotal != null ? `₹${previous.expenseTotal}` : undefined} />
              <NumberRow label="Leaves approved" value={current.leaveApprovedCount} prev={previous?.leaveApprovedCount} />
              <NumberRow label="Leaves pending" value={current.leavePendingCount} prev={previous?.leavePendingCount} />
              <NumberRow label="Secondary sales value" value={`₹${current.secondarySalesValue}`} prev={previous?.secondarySalesValue != null ? `₹${previous.secondarySalesValue}` : undefined} last />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function NumberRow({ label, value, prev, last }) {
  return (
    <View style={[styles.numberRow, !last && styles.numberRowBorder]}>
      <Text style={styles.numberLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.numberValue}>{value}</Text>
        {prev !== undefined && <Text style={styles.numberPrev}>vs {prev} last period</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterTextActive: { color: colors.white },
  sectionLabel: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs, marginTop: spacing.sm },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, gap: spacing.sm },
  reportTile: { width: '47%' },
  reportCard: { gap: spacing.xs, position: 'relative' },
  reportTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  reportChevron: { position: 'absolute', right: spacing.md, top: spacing.md },
  numbersCard: { marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.lg, padding: 0, overflow: 'hidden' },
  numberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  numberRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  numberLabel: { fontSize: 13, color: colors.ink, flex: 1 },
  numberValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
  numberPrev: { fontSize: 10, color: colors.muted, marginTop: 2 }
});
