import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Palmtree, Calendar, Send, Ban, Clock3 } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as leavesApi from '../../api/leaves';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import DateField from '../../components/DateField';
import StatusBadge from '../../components/StatusBadge';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import LoadingView from '../../components/LoadingView';
import EmptyState from '../../components/EmptyState';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';

const LEAVE_TYPES = [
  { label: 'Casual Leave (CL)', value: 'Casual' },
  { label: 'Sick Leave (SL)', value: 'Sick' },
  { label: 'Earned Leave (EL)', value: 'Earned' },
  { label: 'Unpaid Leave (LWP)', value: 'Unpaid' },
  { label: 'Maternity Leave', value: 'Maternity' },
  { label: 'Other', value: 'Other' }
];

const STATUS_TONE = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Cancelled: 'neutral'
};

const toDateStr = (date) => new Date(date).toISOString().slice(0, 10);
const todayStr = () => toDateStr(new Date());

const calculateDays = (start, end) => {
  if (!start || !end) return 1;
  const d1 = new Date(start);
  const d2 = new Date(end);
  if (d2 < d1) return 0;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
};

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ApplyLeaveScreen() {
  const [type, setType] = useState('Casual');
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const leaves = useAsync(leavesApi.listMine, []);
  useRefreshOnFocus(leaves.reload);

  const daysCount = useMemo(() => calculateDays(fromDate, toDate), [fromDate, toDate]);

  const handleFromDateChange = (val) => {
    setFromDate(val);
    if (new Date(toDate) < new Date(val)) {
      setToDate(val);
    }
  };

  const handleToDateChange = (val) => {
    if (new Date(val) < new Date(fromDate)) {
      setToDate(fromDate);
    } else {
      setToDate(val);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (daysCount <= 0) {
      setError('To Date cannot be before From Date');
      return;
    }

    setSubmitting(true);
    try {
      await leavesApi.apply({
        type,
        fromDate,
        toDate,
        days: daysCount,
        reason: reason.trim()
      });
      setSuccess('Leave application submitted successfully.');
      setReason('');
      await leaves.reload();
    } catch (err) {
      setError(err.uiMessage || err.message || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = (leaveId) => {
    const doCancel = async () => {
      setCancellingId(leaveId);
      try {
        await leavesApi.cancel(leaveId);
        await leaves.reload();
      } catch (err) {
        if (Platform.OS === 'web') {
          window.alert(err.uiMessage || err.message || 'Could not cancel leave request');
        } else {
          Alert.alert('Error', err.uiMessage || err.message || 'Could not cancel leave request');
        }
      } finally {
        setCancellingId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to cancel this leave request?')) {
        doCancel();
      }
    } else {
      Alert.alert(
        'Cancel Leave Request',
        'Are you sure you want to cancel this leave request?',
        [
          { text: 'No', style: 'cancel' },
          { text: 'Yes, Cancel', style: 'destructive', onPress: doCancel }
        ]
      );
    }
  };

  const canSubmit = type && fromDate && toDate && daysCount > 0 && !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={leaves.status === 'loading'} onRefresh={leaves.reload} />}
      >
        <View style={styles.header}>
          <Text style={typography.title}>Apply Leave</Text>
          <Text style={typography.subtitle}>Request time off and monitor your leave status</Text>
        </View>

        {/* Application Form */}
        <Card style={styles.formCard}>
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <Palmtree size={20} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>New Leave Request</Text>
          </View>

          <SelectField
            label="Leave Type"
            value={type}
            onChange={setType}
            options={LEAVE_TYPES}
          />

          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <DateField
                label="From Date"
                value={fromDate}
                onChange={handleFromDateChange}
              />
            </View>
            <View style={styles.dateCol}>
              <DateField
                label="To Date"
                value={toDate}
                onChange={handleToDateChange}
              />
            </View>
          </View>

          <View style={styles.durationRow}>
            <Text style={typography.label}>Duration</Text>
            <Text style={styles.durationBadge}>
              {daysCount} day{daysCount === 1 ? '' : 's'}
            </Text>
          </View>

          <FormField
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Provide a reason for the leave request…"
            multiline
            numberOfLines={3}
          />

          <ErrorBanner message={error} />
          <SuccessBanner message={success} />

          <Button
            icon={Send}
            title="Submit Leave Request"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            style={styles.submitBtn}
          />
        </Card>

        {/* Previous Requests List */}
        <View style={styles.listHeader}>
          <Text style={typography.label}>My Leave Requests</Text>
          {leaves.data?.length > 0 && (
            <Text style={styles.countBadge}>{leaves.data.length}</Text>
          )}
        </View>

        {leaves.status === 'loading' && !leaves.data && <LoadingView />}
        {leaves.status === 'error' && <ErrorBanner message={leaves.error} />}

        {leaves.status === 'success' && leaves.data?.length === 0 && (
          <EmptyState
            icon={Palmtree}
            title="No leave requests yet"
            subtitle="Your submitted leave applications will appear here."
          />
        )}

        {(leaves.data || []).map((item) => {
          const canCancel = item.status === 'Pending'
          const itemType = LEAVE_TYPES.find((t) => t.value === item.type)?.label || item.type;

          return (
            <Card key={item._id} style={styles.leaveItem}>
              <View style={styles.itemTopRow}>
                <Text style={styles.itemType}>{itemType}</Text>
                <StatusBadge
                  label={item.status}
                  tone={STATUS_TONE[item.status] || 'neutral'}
                />
              </View>

              <View style={styles.itemDatesRow}>
                <Calendar size={14} color={colors.muted} />
                <Text style={styles.itemDatesText}>
                  {formatDate(item.fromDate)}
                  {item.fromDate !== item.toDate ? ` → ${formatDate(item.toDate)}` : ''}
                  {' · '}{item.days} day{item.days === 1 ? '' : 's'}
                </Text>
              </View>

              {item.reason ? (
                <Text style={styles.itemReason}>"{item.reason}"</Text>
              ) : null}

              {item.decisionNote ? (
                <View style={styles.decisionNoteBox}>
                  <Text style={styles.decisionNoteLabel}>Note from approver:</Text>
                  <Text style={styles.decisionNoteText}>{item.decisionNote}</Text>
                </View>
              ) : null}

              {canCancel && (
                <View style={styles.itemActions}>
                  <Button
                    icon={Ban}
                    title="Cancel Request"
                    variant="ghost"
                    size="sm"
                    loading={cancellingId === item._id}
                    onPress={() => handleCancel(item._id)}
                    style={styles.cancelBtn}
                  />
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: 2 },
  formCard: { gap: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateCol: { flex: 1 },
  durationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  durationBadge: { fontSize: 13, fontWeight: '700', color: colors.primary },
  submitBtn: { marginTop: spacing.xs },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  countBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill
  },
  leaveItem: { gap: spacing.xs },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemType: { fontSize: 15, fontWeight: '600', color: colors.ink },
  itemDatesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  itemDatesText: { fontSize: 13, color: colors.muted },
  itemReason: { fontSize: 13, color: colors.ink, fontStyle: 'italic', marginTop: 4 },
  decisionNoteBox: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginTop: 4,
    gap: 2
  },
  decisionNoteLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  decisionNoteText: { fontSize: 12, color: colors.ink },
  itemActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  cancelBtn: { alignSelf: 'flex-end' }
});
