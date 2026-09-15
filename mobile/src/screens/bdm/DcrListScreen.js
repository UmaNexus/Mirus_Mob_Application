import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardList, Send, Undo2, Stethoscope, MapPin, Clock3, RefreshCw, Tent, Handshake } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as dcrApi from '../../api/dcr';
import Card from '../../components/Card';
import Button from '../../components/Button';
import SelectField from '../../components/SelectField';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../theme';

const todayKey = () => new Date().toISOString().slice(0, 10);
const TONE_BY_STATUS = { pending: 'warning', completed: 'success', missed: 'danger' };

const CATEGORY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'individual', label: 'Individual' },
  { value: 'joint', label: 'Joint' },
  { value: 'camp', label: 'Camp' },
  { value: 'meeting', label: 'Meeting' }
];
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'missed', label: 'Missed' }
];

/**
 * Today's Daily Call Report — a review/completion/submission screen only.
 * Every call here was created elsewhere (Today's Work Type's "Confirm & Log
 * Call"); DCR itself has zero call-creation controls. Category/status
 * dropdowns only change what is displayed — the summary counts and Submit DCR always
 * act on the full, unfiltered day per the existing backend workflow.
 */
export default function DcrListScreen({ navigation }) {
  const [actionError, setActionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [markingMissed, setMarkingMissed] = useState(false);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const dcrs = useAsync(() => dcrApi.listMine({ date: todayKey() }), []);
  useRefreshOnFocus(dcrs.reload);

  const summary = useMemo(() => {
    const data = dcrs.data || [];
    return {
      total: data.length,
      completed: data.filter((d) => d.status === 'completed').length,
      pending: data.filter((d) => d.status === 'pending').length,
      missed: data.filter((d) => d.status === 'missed').length
    };
  }, [dcrs.data]);

  const filtered = useMemo(() => {
    const data = dcrs.data || [];
    return data.filter((d) => (category === 'all' || d.type === category) && (status === 'all' || d.status === status));
  }, [dcrs.data, category, status]);

  const sections = useMemo(() => {
    const byType = (t) => filtered.filter((d) => d.type === t);
    return [
      { title: 'Individual Calls', data: byType('individual') },
      { title: 'Joint Calls', data: byType('joint') },
      { title: 'Camps', data: byType('camp') },
      { title: 'Meetings', data: byType('meeting') },
      { title: 'Missed Visits', data: byType('missed') }
    ].filter((s) => s.data.length > 0);
  }, [filtered]);

  // The Daily DCR has no stored day-level status — it is derived from the
  // rows themselves: none submitted yet (draft), every row submitted
  // (submitted), or a mix (a legitimate new activity was logged after the
  // last submission, so the report needs resubmitting). See the backend
  // DailyCallReport model doc for why this is intentionally not a field.
  const reportStatus = useMemo(() => {
    const data = dcrs.data || [];
    if (data.length === 0) return 'none';
    const submittedCount = data.filter((d) => d.submittedAt).length;
    if (submittedCount === 0) return 'draft';
    if (submittedCount === data.length) return 'submitted';
    return 'needsResubmission';
  }, [dcrs.data]);

  const handleSubmitDay = async () => {
    setActionError(null);
    setSubmitting(true);
    try {
      await dcrApi.submitDay(todayKey());
      await dcrs.reload();
    } catch (err) {
      setActionError(err.uiMessage || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const runMarkRemainingMissed = async () => {
    setActionError(null);
    setMarkingMissed(true);
    try {
      await dcrApi.markRemainingMissed(todayKey());
      await dcrs.reload();
    } catch (err) {
      setActionError(err.uiMessage || err.message);
    } finally {
      setMarkingMissed(false);
    }
  };

  const confirmMarkRemainingMissed = () => {
    Alert.alert(
      'Mark remaining calls as missed?',
      `${summary.pending} pending call${summary.pending === 1 ? '' : 's'} will be marked as missed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as missed', style: 'destructive', onPress: runMarkRemainingMissed }
      ]
    );
  };

  const openCall = (item) => navigation.navigate('DcrDetail', { dcr: item });

  const dateLabel = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Daily Call Report</Text>
        <Text style={typography.subtitle}>{dateLabel}</Text>
      </View>

      {dcrs.status === 'success' && (
        <Card style={styles.summaryCard}>
          <SummaryStat value={summary.total} label="Planned" />
          <SummaryStat value={summary.completed} label="Completed" color={colors.success} />
          <SummaryStat value={summary.pending} label="Pending" color={colors.warning} />
          <SummaryStat value={summary.missed} label="Missed" color={colors.danger} />
        </Card>
      )}

      {dcrs.status === 'success' && summary.total > 0 && (
        <View style={styles.filters}>
          <View style={styles.filterCol}>
            <SelectField
              label="Category"
              value={category}
              onChange={setCategory}
              options={CATEGORY_FILTERS}
            />
          </View>
          <View style={styles.filterCol}>
            <SelectField
              label="Status"
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS}
            />
          </View>
        </View>
      )}

      {dcrs.status === 'loading' && <LoadingView />}
      {dcrs.status === 'error' && <ErrorBanner message={dcrs.error} />}

      <SectionList
        contentContainerStyle={styles.list}
        sections={sections}
        keyExtractor={(item) => item._id}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title.toUpperCase()}</Text>}
        ListEmptyComponent={
          dcrs.status === 'success' ? (
            <EmptyState
              icon={ClipboardList}
              title={summary.total === 0 ? 'No calls logged today' : 'No calls match these filters'}
              subtitle={summary.total === 0 ? "Log one from Today's Work Type." : 'Try a different category or status.'}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const isActivity = item.type === 'camp' || item.type === 'meeting';
          const RowIcon = item.type === 'camp' ? Tent : item.type === 'meeting' ? Handshake : Stethoscope;
          return (
            <Card style={styles.row} onPress={() => openCall(item)}>
              <View style={styles.rowTop}>
                <Text style={styles.category}>{item.type.toUpperCase()}</Text>
                <StatusBadge label={item.status} tone={TONE_BY_STATUS[item.status]} />
              </View>
              <View style={styles.doctorRow}>
                <RowIcon size={14} color={colors.muted} />
                <Text style={styles.doctorName}>{isActivity ? item.activityName : (item.doctorId?.name || 'Unknown doctor')}</Text>
              </View>
              {!isActivity && (
                <Text style={styles.meta}>
                  {[item.productsDetailed?.[0], item.doctorId?.speciality].filter(Boolean).join(' · ') || 'No product noted'}
                </Text>
              )}
              {(isActivity ? item.venue : item.doctorId?.area) ? (
                <View style={styles.metaRow}>
                  <MapPin size={12} color={colors.muted} />
                  <Text style={styles.meta}>{isActivity ? item.venue : item.doctorId.area}</Text>
                </View>
              ) : null}
              {item.status !== 'pending' && (
                <View style={styles.metaRow}>
                  <Clock3 size={12} color={colors.muted} />
                  <Text style={styles.time}>{new Date(item.visitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              )}
              {item.status === 'pending' && <Text style={styles.logHint}>Tap to complete</Text>}
            </Card>
          );
        }}
      />

      {dcrs.status === 'success' && summary.total > 0 && reportStatus !== 'submitted' && (
        <View style={styles.submitBar}>
          {reportStatus === 'needsResubmission' ? (
            <>
              <View style={styles.updatedBadgeRow}>
                <RefreshCw size={14} color={colors.warning} />
                <Text style={styles.updatedBadgeText}>Updated since last submission</Text>
              </View>
              <Text style={styles.progressText}>Your daily report has new activity. Please submit again.</Text>
            </>
          ) : (
            <Text style={typography.label}>Submit today's DCR</Text>
          )}
          <Text style={styles.progressText}>{summary.completed + summary.missed} of {summary.total} visits handled.</Text>
          {summary.pending > 0 && (
            <Text style={styles.pendingWarning}>
              You have {summary.pending} pending call{summary.pending === 1 ? '' : 's'}. Complete them or mark them as missed before submitting.
            </Text>
          )}
          <ErrorBanner message={actionError} />
          {summary.pending > 0 && (
            <Button icon={Undo2} title="Mark remaining as missed" variant="outline" onPress={confirmMarkRemainingMissed} loading={markingMissed} />
          )}
          <Button
            icon={Send}
            title={reportStatus === 'needsResubmission' ? 'Submit Updated DCR' : 'Submit DCR'}
            onPress={handleSubmitDay}
            loading={submitting}
            disabled={summary.pending > 0}
          />
        </View>
      )}
      {reportStatus === 'submitted' && (
        <View style={styles.submitBar}>
          <StatusBadge label="Submitted" tone="success" />
        </View>
      )}
    </SafeAreaView>
  );
}

function SummaryStat({ value, label, color = colors.ink }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  summaryCard: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  summaryStat: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterCol: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: colors.muted, backgroundColor: colors.surface, paddingVertical: spacing.xs, letterSpacing: 0.4 },
  row: { gap: 4, marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  doctorName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: colors.muted },
  time: { fontSize: 11, color: colors.muted },
  logHint: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 },
  submitBar: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card, gap: spacing.sm },
  progressText: { fontSize: 12, color: colors.muted },
  pendingWarning: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  updatedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updatedBadgeText: { fontSize: 12, fontWeight: '700', color: colors.warning }
});
