import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as mtpApi from '../../api/mtp';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import FormField from '../../components/FormField';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, spacing, typography } from '../../theme';

const currentMonth = () => new Date().toISOString().slice(0, 7);

const TONE_BY_STATUS = { draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };

/**
 * A BDM's own current-month tour plan. Status and approverId are entirely
 * server-derived (see server/controllers/mtpController.js) — this screen
 * only ever displays what the backend returns, never computes or guesses
 * an approval state itself.
 */
export default function MtpScreen() {
  const month = currentMonth();
  const mtps = useAsync(() => mtpApi.listMine(month), []);
  useRefreshOnFocus(mtps.reload);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const plan = (mtps.data || [])[0] || null;
  const editable = !plan || ['draft', 'rejected', 'withdrawn'].includes(plan.status);

  const runAction = async (fn) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await mtps.reload();
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOrEdit = () => runAction(() => mtpApi.upsert({ month, remarks }));
  const handleSubmit = () => runAction(() => mtpApi.submit(plan._id, remarks));
  const handleWithdraw = () => runAction(() => mtpApi.withdraw(plan._id));

  if (mtps.status === 'loading') return <LoadingView />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={typography.title}>Monthly Tour Plan</Text>
          <Text style={typography.subtitle}>{month}</Text>
        </View>

        {mtps.status === 'error' && <ErrorBanner message={mtps.error} />}
        <ErrorBanner message={error} />

        {plan && (
          <Card>
            <View style={styles.statusRow}>
              <Text style={typography.body}>Status</Text>
              <StatusBadge label={plan.status} tone={TONE_BY_STATUS[plan.status]} />
            </View>
            {plan.submittedAt && <Text style={styles.meta}>Submitted {new Date(plan.submittedAt).toLocaleString()}</Text>}
            {plan.decidedAt && <Text style={styles.meta}>Decided {new Date(plan.decidedAt).toLocaleString()}{plan.decisionNote ? ` — ${plan.decisionNote}` : ''}</Text>}
            {plan.status === 'pending' && <Text style={styles.meta}>Awaiting your manager's decision</Text>}
          </Card>
        )}

        {editable && (
          <Card style={styles.formCard}>
            <FormField label="Remarks for your manager (optional)" value={remarks} onChangeText={setRemarks} placeholder="Add a note…" multiline numberOfLines={3} />
            <View style={styles.actionsRow}>
              <Button title={plan ? 'Save changes' : 'Create draft'} variant="outline" onPress={handleCreateOrEdit} loading={busy} style={styles.actionBtn} />
              {plan && <Button title="Submit" onPress={handleSubmit} loading={busy} style={styles.actionBtn} />}
            </View>
          </Card>
        )}

        {plan?.status === 'pending' && (
          <Button title="Withdraw" variant="danger" onPress={handleWithdraw} loading={busy} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  header: {},
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontSize: 12, color: colors.muted, marginTop: spacing.xs },
  formCard: { gap: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 }
});
