import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheck, CircleX } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import * as mtpApi from '../../api/mtp';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import StatusBadge from '../../components/StatusBadge';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, spacing, typography } from '../../theme';

const TONE_BY_STATUS = { draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };

/**
 * Read-only detail of one BDM's Monthly Tour Plan, with approve/reject
 * limited to the exact server-computed approver — this screen never lets the
 * manager pick who "should" approve, and the decision itself is re-validated
 * server-side (only `plan.approverId` or company-wide access may decide it).
 */
export default function MtpReviewScreen({ route, navigation }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(route.params.plan);
  const bdmName = route.params.bdmName;

  const [note, setNote] = useState('');
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const visitsByDate = useMemo(() => {
    const m = new Map();
    (plan.plannedVisits || []).forEach((v) => {
      const dateKey = new Date(v.date).toISOString().slice(0, 10);
      if (!m.has(dateKey)) m.set(dateKey, []);
      m.get(dateKey).push(v);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [plan.plannedVisits]);

  const isDesignatedApprover = plan.approverId && String(plan.approverId) === String(user?._id);
  const canDecide = plan.status === 'pending' && isDesignatedApprover;

  const decide = async (status) => {
    setError(null); setBusy(true);
    try {
      const updated = await mtpApi.decide(plan._id, status, note);
      setPlan(updated);
      setShowRejectNote(false);
      navigation.setOptions({ title: bdmName });
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={typography.title}>{bdmName}</Text>
            <Text style={typography.subtitle}>{plan.month}</Text>
          </View>
          <StatusBadge label={plan.status} tone={TONE_BY_STATUS[plan.status]} />
        </View>

        {plan.remarks ? (
          <Card>
            <Text style={typography.label}>Remarks</Text>
            <Text style={typography.body}>{plan.remarks}</Text>
          </Card>
        ) : null}

        <Card>
          <Text style={typography.label}>Planned visits ({plan.plannedVisits?.length || 0})</Text>
          {visitsByDate.length === 0 && <Text style={styles.hint}>No visits planned.</Text>}
          {visitsByDate.map(([date, visits]) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateLabel}>{date}</Text>
              {visits.map((v, idx) => (
                <Text key={`${v.doctorId?._id || v.doctorId}-${idx}`} style={styles.visitLine}>
                  • {v.doctorId?.name || 'Doctor'}{v.doctorId?.area ? ` — ${v.doctorId.area}` : ''}
                </Text>
              ))}
            </View>
          ))}
        </Card>

        {plan.decidedAt && (
          <Text style={styles.hint}>Decided {new Date(plan.decidedAt).toLocaleString()}{plan.decisionNote ? ` — ${plan.decisionNote}` : ''}</Text>
        )}

        <ErrorBanner message={error} />

        {canDecide && (
          <Card style={styles.decisionCard}>
            {showRejectNote && (
              <FormField label="Rejection note (optional)" value={note} onChangeText={setNote} placeholder="Let them know what to change…" multiline numberOfLines={3} />
            )}
            <View style={styles.decisionRow}>
              {!showRejectNote && (
                <Button icon={CircleX} title="Reject" variant="danger" onPress={() => setShowRejectNote(true)} style={styles.decisionBtn} />
              )}
              {showRejectNote && (
                <Button icon={CircleX} title="Confirm Reject" variant="danger" onPress={() => decide('rejected')} loading={busy} style={styles.decisionBtn} />
              )}
              <Button icon={CircleCheck} title="Approve" onPress={() => decide('approved')} loading={busy} style={styles.decisionBtn} />
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { fontSize: 12, color: colors.muted },
  dateGroup: { marginTop: spacing.sm },
  dateLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  visitLine: { fontSize: 13, color: colors.ink, marginLeft: spacing.xs },
  decisionCard: { gap: spacing.sm },
  decisionRow: { flexDirection: 'row', gap: spacing.sm },
  decisionBtn: { flex: 1 }
});
