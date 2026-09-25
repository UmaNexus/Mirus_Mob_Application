import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import { colors, spacing, typography } from '../../theme';

const STATUS_LABEL = { top: 'Top', active: 'Active', review: 'Review', low: 'Low' };
const STATUS_TONE = { top: 'success', active: 'success', review: 'warning', low: 'danger' };

/**
 * Read-only BDM activity snapshot, reached from `ExecutiveMonitorScreen`.
 * Uses the row data already returned by `tier-directory` — no extra API
 * call, since that endpoint already computes everything this screen shows.
 */
export default function EmployeeActivityDetailScreen({ route }) {
  const employee = route.params?.employee || {};

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.hero}>
          <Text style={styles.name}>{employee.name || 'Unnamed'}</Text>
          <Text style={styles.meta}>
            {employee.tier}{employee.territory ? ` · ${employee.territory}` : ''}{employee.employeeId ? ` · ${employee.employeeId}` : ''}
          </Text>
          {employee.status ? <StatusBadge label={STATUS_LABEL[employee.status]} tone={STATUS_TONE[employee.status]} /> : null}
        </Card>

        <Text style={typography.label}>This month</Text>
        <Card style={styles.statCard}>
          <View style={styles.statGrid}>
            <Stat value={`${employee.dcrRate ?? 0}%`} label="DCR Rate" />
            <Stat value={`${employee.mtpAdherence ?? 0}%`} label="MTP Adherence" />
            <Stat value={employee.visitDays ?? 0} label="Visit Days" />
            <Stat value={employee.workingDays ?? 0} label="Working Days" />
          </View>
        </Card>

        <Card style={styles.noticeCard}>
          <Text style={styles.notice}>Active: {employee.isActive ? 'Yes' : 'No'}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { gap: spacing.xs },
  name: { fontSize: 18, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  statCard: { gap: spacing.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  stat: { width: '50%', alignItems: 'center', paddingHorizontal: spacing.xs },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
  noticeCard: {},
  notice: { fontSize: 12, color: colors.muted }
});
