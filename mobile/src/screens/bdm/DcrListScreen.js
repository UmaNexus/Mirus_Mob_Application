import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as dcrApi from '../../api/dcr';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../theme';

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function DcrListScreen({ navigation }) {
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const dcrs = useAsync(() => dcrApi.listMine({ date: todayKey() }), []);
  useRefreshOnFocus(dcrs.reload);

  const handleSubmitDay = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await dcrApi.submitDay(todayKey());
      await dcrs.reload();
    } catch (err) {
      setSubmitError(err.uiMessage || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const unsubmittedCount = (dcrs.data || []).filter((d) => !d.submittedAt).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Daily Call Report</Text>
        <Text style={typography.subtitle}>Today</Text>
      </View>

      <View style={styles.actionsRow}>
        <Button title="+ Individual" variant="outline" style={styles.actionBtn} onPress={() => navigation.navigate('DcrForm', { type: 'individual' })} />
        <Button title="+ Joint" variant="outline" style={styles.actionBtn} onPress={() => navigation.navigate('DcrForm', { type: 'joint' })} />
        <Button title="+ Missed" variant="outline" style={styles.actionBtn} onPress={() => navigation.navigate('DcrForm', { type: 'missed' })} />
      </View>

      {dcrs.status === 'loading' && <LoadingView />}
      {dcrs.status === 'error' && <ErrorBanner message={dcrs.error} />}
      <ErrorBanner message={submitError} />

      <FlatList
        contentContainerStyle={styles.list}
        data={dcrs.data || []}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={dcrs.status === 'success' ? <EmptyState icon="📋" title="No calls logged today" /> : null}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.doctorName}>{item.doctorId?.name || 'Unknown doctor'}</Text>
              <StatusBadge label={item.type} tone={item.type === 'missed' ? 'danger' : item.type === 'joint' ? 'info' : 'success'} />
            </View>
            <Text style={styles.meta}>{item.doctorId?.speciality || ''}</Text>
            <Text style={styles.meta}>{new Date(item.visitTime).toLocaleTimeString()}</Text>
            {item.submittedAt ? <StatusBadge label="Submitted" tone="success" /> : <StatusBadge label="Pending submission" tone="warning" />}
          </Card>
        )}
      />

      {unsubmittedCount > 0 && (
        <View style={styles.submitBar}>
          <Text style={typography.body}>{unsubmittedCount} call(s) not yet submitted</Text>
          <Button title="Submit DCR" onPress={handleSubmitDay} loading={submitting} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  actionBtn: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  row: { gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doctorName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  submitBar: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card, gap: spacing.sm }
});
