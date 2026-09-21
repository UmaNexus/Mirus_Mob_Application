import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from '../Card';
import { colors, spacing } from '../../theme';

/** Fixed current-month attendance summary footer — shared by `TeamAttendanceScreen` and `ExecutiveAttendanceScreen`. */
export default function MonthlySummaryCard({ monthlySummary }) {
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
  monthlyCard: { marginTop: spacing.sm },
  monthlyTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  monthlyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  monthlyStat: { width: '30%', alignItems: 'center' },
  monthlyValue: { fontSize: 15, fontWeight: '700', color: colors.ink },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 2, textAlign: 'center' }
});
