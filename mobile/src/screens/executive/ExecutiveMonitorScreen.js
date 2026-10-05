import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, ChevronRight } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography, iconSizes } from '../../theme';

// The server sends `directReportCount` only for manager rows (drill-able); leaf rows carry performance instead.
const isManagerRow = (row) => typeof row.directReportCount === 'number';

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const STATUS_LABEL = { top: 'Top', active: 'Active', review: 'Review', low: 'Low' };
const STATUS_TONE = { top: 'success', active: 'success', review: 'warning', low: 'danger' };

/**
 * Executive Monitor — the drill-down tab. Shows exactly one level of the
 * hierarchy at a time (GET /api/field-force/tier-directory, re-validated
 * server-side on every drill). Tapping a manager-tier row (ASM/RSM/ZSM/NSM)
 * pushes this same screen scoped to that manager's own direct reports;
 * tapping a BDM row pushes a read-only activity detail using data already
 * in hand.
 */
export default function ExecutiveMonitorScreen({ navigation, route }) {
  const managerId = route.params?.managerId;
  const directory = useAsync(() => fieldForceApi.getTierDirectory({ managerId }), [managerId]);
  useRefreshOnFocus(directory.reload);

  const rows = directory.data?.data || [];

  const onRowPress = (row) => {
    if (isManagerRow(row)) {
      navigation.push('ExecutiveMonitorMain', { managerId: row.userId, managerName: row.name });
    } else {
      navigation.navigate('EmployeeActivityDetail', { employee: row });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>{managerId ? 'Team' : 'Organization'}</Text>
        <Text style={typography.subtitle}>Tap a manager to drill into their team</Text>
      </View>

      {directory.status === 'loading' && <LoadingView />}
      {directory.status === 'error' && <ErrorBanner message={directory.error} />}

      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => String(item.userId)}
        ListEmptyComponent={directory.status === 'success' ? <EmptyState icon={Users} title="No one reports here yet" /> : null}
        renderItem={({ item }) => (
          <Card onPress={() => onRowPress(item)} style={styles.row}>
            <View style={styles.rowTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name || 'Unnamed'}</Text>
                <Text style={styles.meta}>
                  {item.roleName || 'No role'}
                  {isManagerRow(item)
                    ? ` · ${item.directReportCount} direct report${item.directReportCount === 1 ? '' : 's'}`
                    : ''}
                </Text>
                {typeof item.dcrRate === 'number' && (
                  <Text style={styles.meta}>DCR: {item.dcrRate}% · MTP: {item.mtpAdherence}%</Text>
                )}
              </View>
              {item.status ? <StatusBadge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} /> : null}
              {isManagerRow(item) ? <ChevronRight size={iconSizes.header} color={colors.muted} /> : null}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  row: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 11, color: colors.muted, marginTop: 2 }
});
