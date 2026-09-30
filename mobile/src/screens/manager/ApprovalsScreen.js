import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Receipt, Palmtree, CircleCheck, CircleX, ChevronRight } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as mtpApi from '../../api/mtp';
import * as expensesApi from '../../api/expenses';
import * as leavesApi from '../../api/leaves';
import { displayName } from '../../navigation/roleHelpers';
import { blocksFromVisits, rangeLabel } from '../../utils/mtpBlocks';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, radii, typography } from '../../theme';

const rupees = (paisa) => `₹${Math.round((paisa || 0) / 100).toLocaleString('en-IN')}`;

export default function ApprovalsScreen({ navigation, route }) {
  const initialTab = route?.params?.tab || 'mtp';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (route?.params?.tab && ['mtp', 'expenses', 'leaves'].includes(route.params.tab)) {
      setActiveTab(route.params.tab);
    }
  }, [route?.params?.tab]);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionBusyId, setActionBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  const mtpPending = useAsync(mtpApi.listPending, []);
  const expensesPending = useAsync(expensesApi.listPending, []);
  const leavesPending = useAsync(leavesApi.listPending, []);

  useRefreshOnFocus(mtpPending.reload);
  useRefreshOnFocus(expensesPending.reload);
  useRefreshOnFocus(leavesPending.reload);

  const refreshing =
    activeTab === 'mtp'
      ? mtpPending.status === 'loading'
      : activeTab === 'expenses'
      ? expensesPending.status === 'loading'
      : leavesPending.status === 'loading';

  const handleRefresh = () => {
    if (activeTab === 'mtp') mtpPending.reload();
    else if (activeTab === 'expenses') expensesPending.reload();
    else leavesPending.reload();
  };

  const handleDecideMtp = async (planId, status, note = '') => {
    setActionError(null);
    setActionSuccess(null);
    setActionBusyId(planId);
    try {
      await mtpApi.decide(planId, status, note);
      setActionSuccess(`MTP ${status}.`);
      setRejectingId(null);
      setRejectNote('');
      await mtpPending.reload();
    } catch (err) {
      setActionError(err.uiMessage || err.message);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDecideExpense = async (expenseId, status, note = '') => {
    setActionError(null);
    setActionSuccess(null);
    setActionBusyId(expenseId);
    try {
      await expensesApi.decide(expenseId, status, note);
      setActionSuccess(`Expense ${status}.`);
      setRejectingId(null);
      setRejectNote('');
      await expensesPending.reload();
    } catch (err) {
      setActionError(err.uiMessage || err.message);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDecideLeave = async (leaveId, status, note = '') => {
    setActionError(null);
    setActionSuccess(null);
    setActionBusyId(leaveId);
    try {
      await leavesApi.decide(leaveId, status === 'approved' ? 'Approved' : 'Rejected', note);
      setActionSuccess(`Leave ${status}.`);
      setRejectingId(null);
      setRejectNote('');
      await leavesPending.reload();
    } catch (err) {
      setActionError(err.uiMessage || err.message);
    } finally {
      setActionBusyId(null);
    }
  };

  const mtpCount = mtpPending.data?.length ?? 0;
  const expenseCount = expensesPending.data?.length ?? 0;
  const leaveCount = leavesPending.data?.length ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Approvals</Text>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tabBtn, activeTab === 'mtp' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('mtp');
              setRejectingId(null);
            }}
          >
            <CalendarDays size={15} color={activeTab === 'mtp' ? colors.white : colors.ink} />
            <Text style={[styles.tabText, activeTab === 'mtp' && styles.tabTextActive]}>
              MTP {mtpCount > 0 ? `(${mtpCount})` : ''}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tabBtn, activeTab === 'expenses' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('expenses');
              setRejectingId(null);
            }}
          >
            <Receipt size={15} color={activeTab === 'expenses' ? colors.white : colors.ink} />
            <Text style={[styles.tabText, activeTab === 'expenses' && styles.tabTextActive]}>
              Expenses {expenseCount > 0 ? `(${expenseCount})` : ''}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tabBtn, activeTab === 'leaves' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('leaves');
              setRejectingId(null);
            }}
          >
            <Palmtree size={15} color={activeTab === 'leaves' ? colors.white : colors.ink} />
            <Text style={[styles.tabText, activeTab === 'leaves' && styles.tabTextActive]}>
              Leaves {leaveCount > 0 ? `(${leaveCount})` : ''}
            </Text>
          </Pressable>
        </View>
      </View>

      <ErrorBanner message={actionError} />
      <SuccessBanner message={actionSuccess} />

      {activeTab === 'mtp' && (
        mtpPending.status === 'loading' ? (
          <LoadingView />
        ) : mtpPending.status === 'error' ? (
          <ErrorBanner message={mtpPending.error} />
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={mtpPending.data || []}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <EmptyState
                icon={CalendarDays}
                title="No tour plans awaiting approval"
                subtitle="All team tour plans have been reviewed"
              />
            }
            renderItem={({ item }) => {
              const blocks = blocksFromVisits(item.plannedVisits || []);
              const sorted = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate));
              const overallRange = sorted.length
                ? rangeLabel(sorted[0].startDate, sorted[sorted.length - 1].endDate)
                : 'No dates yet';
              const name = displayName(item.userId);
              const isRejecting = rejectingId === item._id;
              const isBusy = actionBusyId === item._id;

              return (
                <Card style={styles.card}>
                  <Pressable
                    style={styles.cardTop}
                    onPress={() => navigation.navigate('MtpReview', { plan: item, bdmName: name })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{name}</Text>
                      <Text style={styles.cardSubtitle}>
                        {item.month} · {overallRange}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.muted} />
                  </Pressable>

                  {item.remarks ? (
                    <Text style={styles.remarksText} numberOfLines={2}>
                      "{item.remarks}"
                    </Text>
                  ) : null}

                  <Text style={styles.visitCount}>
                    {item.plannedVisits?.length || 0} tour day
                    {(item.plannedVisits?.length || 0) === 1 ? '' : 's'}
                  </Text>

                  {isRejecting ? (
                    <View style={styles.rejectBox}>
                      <FormField
                        label="Rejection note (optional)"
                        value={rejectNote}
                        onChangeText={setRejectNote}
                        placeholder="Reason for rejecting..."
                      />
                      <View style={styles.decisionRow}>
                        <Button
                          title="Cancel"
                          variant="outline"
                          onPress={() => {
                            setRejectingId(null);
                            setRejectNote('');
                          }}
                          style={styles.halfBtn}
                        />
                        <Button
                          title="Confirm Reject"
                          variant="danger"
                          loading={isBusy}
                          onPress={() => handleDecideMtp(item._id, 'rejected', rejectNote)}
                          style={styles.halfBtn}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.decisionRow}>
                      <Button
                        icon={CircleX}
                        title="Reject"
                        variant="outline"
                        disabled={isBusy}
                        onPress={() => setRejectingId(item._id)}
                        style={styles.halfBtn}
                      />
                      <Button
                        icon={CircleCheck}
                        title="Approve"
                        variant="primary"
                        loading={isBusy}
                        onPress={() => handleDecideMtp(item._id, 'approved')}
                        style={styles.halfBtn}
                      />
                    </View>
                  )}
                </Card>
              );
            }}
          />
        )
      )}

      {activeTab === 'expenses' && (
        expensesPending.status === 'loading' ? (
          <LoadingView />
        ) : expensesPending.status === 'error' ? (
          <ErrorBanner message={expensesPending.error} />
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={expensesPending.data || []}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <EmptyState
                icon={Receipt}
                title="No pending expenses"
                subtitle="All team expenses have been reviewed"
              />
            }
            renderItem={({ item }) => {
              const isRejecting = rejectingId === item._id;
              const isBusy = actionBusyId === item._id;
              const dateStr = item.date ? new Date(item.date).toLocaleDateString() : '';

              return (
                <Card style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{displayName(item.userId)}</Text>
                      <Text style={styles.cardSubtitle}>
                        {item.category} · {dateStr}
                      </Text>
                    </View>
                    <Text style={styles.amount}>{rupees(item.amount)}</Text>
                  </View>

                  {item.category === 'Travel' && (item.from || item.to) && (
                    <Text style={styles.routeText}>
                      {[item.from, item.to].filter(Boolean).join(' → ')}
                      {item.modeOfTravel ? ` (${item.modeOfTravel})` : ''}
                    </Text>
                  )}

                  {isRejecting ? (
                    <View style={styles.rejectBox}>
                      <FormField
                        label="Rejection note (optional)"
                        value={rejectNote}
                        onChangeText={setRejectNote}
                        placeholder="Reason for rejecting..."
                      />
                      <View style={styles.decisionRow}>
                        <Button
                          title="Cancel"
                          variant="outline"
                          onPress={() => {
                            setRejectingId(null);
                            setRejectNote('');
                          }}
                          style={styles.halfBtn}
                        />
                        <Button
                          title="Confirm Reject"
                          variant="danger"
                          loading={isBusy}
                          onPress={() => handleDecideExpense(item._id, 'rejected', rejectNote)}
                          style={styles.halfBtn}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.decisionRow}>
                      <Button
                        icon={CircleX}
                        title="Reject"
                        variant="outline"
                        disabled={isBusy}
                        onPress={() => setRejectingId(item._id)}
                        style={styles.halfBtn}
                      />
                      <Button
                        icon={CircleCheck}
                        title="Approve"
                        variant="primary"
                        loading={isBusy}
                        onPress={() => handleDecideExpense(item._id, 'approved')}
                        style={styles.halfBtn}
                      />
                    </View>
                  )}
                </Card>
              );
            }}
          />
        )
      )}

      {activeTab === 'leaves' && (
        leavesPending.status === 'loading' ? (
          <LoadingView />
        ) : leavesPending.status === 'error' ? (
          <ErrorBanner message={leavesPending.error} />
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={leavesPending.data || []}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <EmptyState
                icon={Palmtree}
                title="No pending leaves"
                subtitle="All team leave requests have been reviewed"
              />
            }
            renderItem={({ item }) => {
              const isRejecting = rejectingId === item._id;
              const isBusy = actionBusyId === item._id;
              const fromStr = item.fromDate ? new Date(item.fromDate).toLocaleDateString() : '';
              const toStr = item.toDate ? new Date(item.toDate).toLocaleDateString() : '';

              return (
                <Card style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{displayName(item.userId)}</Text>
                      <Text style={styles.cardSubtitle}>
                        {item.type} Leave · {item.days ?? 1} day{(item.days ?? 1) === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={styles.leaveDates}>
                      {fromStr === toStr ? fromStr : `${fromStr} - ${toStr}`}
                    </Text>
                  </View>

                  {item.reason ? (
                    <Text style={styles.remarksText}>
                      Reason: {item.reason}
                    </Text>
                  ) : null}

                  {isRejecting ? (
                    <View style={styles.rejectBox}>
                      <FormField
                        label="Rejection note (optional)"
                        value={rejectNote}
                        onChangeText={setRejectNote}
                        placeholder="Reason for rejecting..."
                      />
                      <View style={styles.decisionRow}>
                        <Button
                          title="Cancel"
                          variant="outline"
                          onPress={() => {
                            setRejectingId(null);
                            setRejectNote('');
                          }}
                          style={styles.halfBtn}
                        />
                        <Button
                          title="Confirm Reject"
                          variant="danger"
                          loading={isBusy}
                          onPress={() => handleDecideLeave(item._id, 'rejected', rejectNote)}
                          style={styles.halfBtn}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.decisionRow}>
                      <Button
                        icon={CircleX}
                        title="Reject"
                        variant="outline"
                        disabled={isBusy}
                        onPress={() => setRejectingId(item._id)}
                        style={styles.halfBtn}
                      />
                      <Button
                        icon={CircleCheck}
                        title="Approve"
                        variant="primary"
                        loading={isBusy}
                        onPress={() => handleDecideLeave(item._id, 'approved')}
                        style={styles.halfBtn}
                      />
                    </View>
                  )}
                </Card>
              );
            }}
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  tabs: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: radii.md, padding: 3, gap: 4 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radii.md
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  tabTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  card: { gap: spacing.xs, marginBottom: spacing.xs },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '700', color: colors.primary },
  leaveDates: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  routeText: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  remarksText: { fontSize: 12, color: colors.ink, backgroundColor: colors.surface, padding: spacing.xs, borderRadius: radii.sm, marginTop: 2 },
  visitCount: { fontSize: 12, color: colors.muted },
  decisionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  halfBtn: { flex: 1 },
  rejectBox: { gap: spacing.xs, marginTop: spacing.xs }
});
