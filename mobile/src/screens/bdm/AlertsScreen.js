import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Cake, Award, Clock3 } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography, iconSizes } from '../../theme';

const ICON = { birthday: Cake, anniversary: Award, expiry: Clock3 };

/** Combined feed from GET /api/field-force/alerts — doctor birthdays/
 * anniversaries and secondary-sale expiry, all computed server-side. */
export default function AlertsScreen() {
  const alerts = useAsync(fieldForceApi.getAlerts, []);
  useRefreshOnFocus(alerts.reload);

  if (alerts.status === 'loading') return <LoadingView />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Alerts</Text>
        <Text style={typography.subtitle}>Reminders & events</Text>
      </View>
      {alerts.status === 'error' && <ErrorBanner message={alerts.error} />}
      <FlatList
        contentContainerStyle={styles.list}
        data={alerts.data || []}
        keyExtractor={(item, idx) => `${item.source}-${item.type}-${idx}`}
        ListEmptyComponent={alerts.status === 'success' ? <EmptyState icon={Bell} title="No alerts right now" /> : null}
        renderItem={({ item }) => {
          const AlertIcon = ICON[item.type] || Bell;
          return (
          <Card style={styles.row}>
            <AlertIcon size={iconSizes.header} color={colors.primary} />
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.type} · {new Date(item.date).toLocaleDateString()}</Text>
            </View>
          </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted, textTransform: 'capitalize' }
});
