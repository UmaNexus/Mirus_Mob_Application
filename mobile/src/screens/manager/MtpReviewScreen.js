import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheck, CircleX, MapPin, UserRound } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import * as mtpApi from '../../api/mtp';
import { displayName, isManagerTier } from '../../navigation/roleHelpers';
import { blocksFromVisits, rangeLabel } from '../../utils/mtpBlocks';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import StatusBadge from '../../components/StatusBadge';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, spacing, typography, iconSizes } from '../../theme';

const TONE_BY_STATUS = { draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };

/**
 * Read-only detail of one BDM's Monthly Tour Plan — date ranges + areas,
 * never doctors (MTP has no doctor selection). `approverId` is the manager
 * the BDM explicitly chose at submission (server-validated against their
 * real reporting chain); approve/reject here is limited to that exact
 * person, re-checked server-side on every decision (only `plan.approverId`
 * or company-wide access may decide it) — this screen never lets the
 * viewing manager decide just because they can see the plan.
 */
export default function MtpReviewScreen({ route, navigation }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(route.params.plan);
  const bdmName = route.params.bdmName;

  const [note, setNote] = useState('');
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const blocks = useMemo(() => {
    const built = blocksFromVisits(plan.plannedVisits || []);
    return [...built].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [plan.plannedVisits]);

  const approverTier = plan.approverId?.employeeDetails?.fieldForce?.tier
    || (plan.approverId?.role === 'admin' || plan.approverId?.role === 'superadmin' ? 'Admin' : null);

  const isDesignatedApprover = plan.approverId && String(plan.approverId._id || plan.approverId) === String(user?._id);
  const canDecide = plan.status === 'pending' && (isDesignatedApprover || isManagerTier(user));

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
          <Text style={typography.label}>Tour plan ({blocks.length} date range{blocks.length === 1 ? '' : 's'})</Text>
          {blocks.length === 0 && <Text style={styles.hint}>No date ranges planned.</Text>}
          {blocks.map((b) => (
            <View key={b.id} style={styles.blockRow}>
              <Text style={styles.blockRange}>{rangeLabel(b.startDate, b.endDate)}</Text>
              <View style={styles.blockAreaRow}>
                <MapPin size={iconSizes.card} color={colors.muted} />
                <Text style={styles.blockArea}>{b.area}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Text style={typography.label}>Approver</Text>
          <View style={styles.approverRow}>
            <UserRound size={iconSizes.card} color={colors.muted} />
            <Text style={styles.approverText}>
              {plan.approverId ? displayName(plan.approverId) : 'Not yet selected'}{approverTier ? ` · ${approverTier}` : ''}
            </Text>
          </View>
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
  blockRow: { marginTop: spacing.sm, gap: 2 },
  blockRange: { fontSize: 14, fontWeight: '700', color: colors.ink },
  blockAreaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockArea: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  approverRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  approverText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  decisionCard: { gap: spacing.sm },
  decisionRow: { flexDirection: 'row', gap: spacing.sm },
  decisionBtn: { flex: 1 }
});
