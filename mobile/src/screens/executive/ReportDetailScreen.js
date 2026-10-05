import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Inbox } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as dcrApi from '../../api/dcr';
import * as mtpApi from '../../api/mtp';
import * as expensesApi from '../../api/expenses';
import * as leavesApi from '../../api/leaves';
import * as doctorsApi from '../../api/doctors';
import * as secondarySalesApi from '../../api/secondarySales';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../theme';

const personName = (u) => `${u?.personalDetails?.firstName || ''} ${u?.personalDetails?.lastName || ''}`.trim() || 'Unassigned';
const paisaToRupees = (paisa) => (Math.round(Number(paisa || 0)) / 100).toFixed(2);
const STATUS_TONE = { approved: 'success', Approved: 'success', pending: 'warning', Pending: 'warning', rejected: 'danger', Rejected: 'danger', missed: 'danger', completed: 'success' };
const APPROVAL_TONE = { approved: colors.success, rejected: colors.danger, pending: colors.warning };

/**
 * Renders the server's already-computed `approval` object (see
 * `server/utils/approvalInfo.js`) — the ACTUAL stored decision-maker, never
 * derived from the current reporting hierarchy. Returns null for
 * draft/withdrawn/cancelled records (the status badge already communicates
 * those) and for `pending`, where the copy is deliberately generic — a
 * pending record must never look like it already has an approver.
 */
const formatApprovalLine = (approval) => {
  if (!approval) return null;
  const dateStr = approval.decidedAt
    ? new Date(approval.decidedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  if (approval.status === 'approved') {
    return approval.decidedBy ? `Approved by ${approval.decidedBy.name} · ${dateStr}` : `Approved${dateStr ? ` · ${dateStr}` : ''}`;
  }
  if (approval.status === 'rejected') {
    const base = approval.decidedBy ? `Rejected by ${approval.decidedBy.name} · ${dateStr}` : `Rejected${dateStr ? ` · ${dateStr}` : ''}`;
    return approval.reason ? `${base} · ${approval.reason}` : base;
  }
  if (approval.status === 'pending') {
    return approval.pendingWith ? `Pending from ${approval.pendingWith.name}` : 'Pending approval';
  }
  return null;
};

/**
 * Fetch + a row-extraction rule per report type. Every fetch reuses an
 * already-existing, already-scoped list endpoint (subtree, or company-wide
 * for admin/superadmin) — this screen adds no new backend surface, it's
 * purely a read-only presentation over data other screens already fetch.
 */
const REPORT_CONFIG = {
  dcr: {
    fetch: () => dcrApi.listTeam('month'),
    row: (item) => ({
      title: item.doctorId?.name || item.activityName || 'Field call',
      subtitle: `${personName(item.userId)} · ${item.dateKey}`,
      status: item.status
    })
  },
  fieldActivity: {
    fetch: () => dcrApi.listTeam('month'),
    row: (item) => ({
      title: `${item.type || 'call'} — ${item.doctorId?.name || 'Field visit'}`,
      subtitle: `${personName(item.userId)} · ${item.dateKey}`,
      status: item.status
    })
  },
  mtp: {
    fetch: () => mtpApi.listTeam(),
    row: (item) => ({
      title: `${item.month} tour plan`,
      subtitle: `${personName(item.userId)} · ${item.plannedVisits?.length || 0} planned visit(s)`,
      status: item.status,
      approval: item.approval
    })
  },
  expenses: {
    fetch: () => expensesApi.listTeam(),
    row: (item) => ({
      title: `${item.category} — ₹${paisaToRupees(item.amount)}`,
      subtitle: `${personName(item.userId)} · ${new Date(item.date).toLocaleDateString('en-IN')}`,
      status: item.status,
      approval: item.approval
    })
  },
  leaves: {
    fetch: () => leavesApi.listTeam(),
    row: (item) => ({
      title: `${item.type} leave`,
      subtitle: `${personName(item.userId)} · ${new Date(item.fromDate).toLocaleDateString('en-IN')} - ${new Date(item.toDate).toLocaleDateString('en-IN')}`,
      status: item.status,
      approval: item.approval
    })
  },
  doctors: {
    fetch: () => doctorsApi.listManaged(),
    row: (item) => ({
      title: item.name,
      subtitle: [item.speciality, item.area].filter(Boolean).join(' · ') || 'No details',
      status: item.assignedTo ? 'Assigned' : 'Unassigned'
    })
  },
  secondarySales: {
    fetch: () => secondarySalesApi.listTeam(),
    row: (item) => ({
      title: `${item.productName} — ₹${paisaToRupees(item.value)}`,
      subtitle: `${personName(item.userId)}${item.batchNumber ? ` · Batch ${item.batchNumber}` : ''}`,
      status: null
    })
  },
  attendance: {
    fetch: () => fieldForceApi.getTeamAttendance('month'),
    extractRows: (data) => data?.rows || [],
    row: (item) => ({
      title: item.name || 'Unnamed',
      subtitle: `${item.employeeId || ''}`,
      status: item.status || (item.presentDays > 0 ? 'Active' : null)
    })
  }
};

export default function ReportDetailScreen({ route }) {
  const { type, title } = route.params || {};
  const config = REPORT_CONFIG[type];

  const list = useAsync(() => (config ? config.fetch() : Promise.resolve([])), [type]);
  useRefreshOnFocus(list.reload);

  const rows = config?.extractRows ? config.extractRows(list.data) : (list.data || []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>{title || 'Report'}</Text>
        <Text style={typography.subtitle}>{rows.length} record{rows.length === 1 ? '' : 's'}</Text>
      </View>

      {list.status === 'loading' && <LoadingView />}
      {list.status === 'error' && <ErrorBanner message={list.error} />}

      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item, index) => String(item._id || item.userId || index)}
        ListEmptyComponent={list.status === 'success' ? <EmptyState icon={Inbox} title="No records for this report" /> : null}
        renderItem={({ item }) => {
          const r = config.row(item);
          const approvalLine = formatApprovalLine(r.approval);
          return (
            <Card style={styles.row}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  <Text style={styles.rowSubtitle}>{r.subtitle}</Text>
                </View>
                {r.status ? <StatusBadge label={r.status} tone={STATUS_TONE[r.status] || 'neutral'} /> : null}
              </View>
              {approvalLine ? (
                <Text style={[styles.approvalLine, { color: APPROVAL_TONE[r.approval?.status] || colors.muted }]}>{approvalLine}</Text>
              ) : null}
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
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  row: { gap: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSubtitle: { fontSize: 11, color: colors.muted, marginTop: 2 },
  approvalLine: { fontSize: 11, fontWeight: '600' }
});
