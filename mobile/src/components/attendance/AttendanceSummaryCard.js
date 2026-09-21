import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from '../Card';
import { colors, spacing } from '../../theme';

/**
 * Total/Punched-In/Not-In/On-Leave stat row — shared by the manager
 * `TeamAttendanceScreen` (BDM-only) and the executive `ExecutiveAttendanceScreen`
 * (any tier). `totalLabel` lets the executive screen say "Total" instead of
 * the manager screen's "Total BDMs" when the row isn't BDM-specific.
 */
export default function AttendanceSummaryCard({ summary, totalLabel = 'Total BDMs' }) {
  if (!summary) return null;
  return (
    <Card style={styles.summaryCard}>
      <SummaryStat value={summary.totalBdms} label={totalLabel} color={colors.ink} />
      <SummaryStat value={summary.punchedIn} label="Punched In" color={colors.success} />
      <SummaryStat value={summary.notIn} label="Not In" color={colors.danger} />
      <SummaryStat value={summary.onLeave} label="On Leave" color={colors.warning} />
    </Card>
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
  summaryCard: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  summaryStat: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 2, textAlign: 'center' }
});
