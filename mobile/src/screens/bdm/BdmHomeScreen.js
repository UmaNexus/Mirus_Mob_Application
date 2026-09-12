import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as attendanceApi from '../../api/attendance';
import * as fieldForceApi from '../../api/fieldForce';
import { displayName } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import Button from '../../components/Button';
import ErrorBanner from '../../components/ErrorBanner';
import LoadingView from '../../components/LoadingView';
import { colors, spacing, radii, typography } from '../../theme';

/**
 * BDM dashboard. Every number here comes from a live API call — no
 * hardcoded demo stats (today's calls, pending DCR, expense total, MTP
 * status, alert count all come from GET /api/field-force/dashboard).
 */
export default function BdmHomeScreen({ navigation }) {
  const { user } = useAuth();
  const [punchBusy, setPunchBusy] = useState(false);
  const [punchError, setPunchError] = useState(null);

  const today = useAsync(attendanceApi.getToday, []);
  const dashboard = useAsync(fieldForceApi.getDashboard, []);
  useRefreshOnFocus(today.reload);
  useRefreshOnFocus(dashboard.reload);

  const handlePunch = async () => {
    setPunchError(null);
    setPunchBusy(true);
    try {
      if (today.data?.punchInAt && !today.data?.punchOutAt) {
        await attendanceApi.punchOut();
      } else {
        await attendanceApi.punchIn();
      }
      await today.reload();
    } catch (err) {
      setPunchError(err.uiMessage || err.message);
    } finally {
      setPunchBusy(false);
    }
  };

  const punchedIn = Boolean(today.data?.punchInAt && !today.data?.punchOutAt);
  const refreshing = today.status === 'loading' && dashboard.status === 'loading';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { today.reload(); dashboard.reload(); }} />}
      >
        <Card style={styles.hero}>
          <Text style={styles.heroName}>{displayName(user)}</Text>
          <Text style={styles.heroSub}>BDM · {user?.employeeDetails?.fieldForce?.territory || 'MIRUS'}</Text>
        </Card>

        {/* Punch In/Out — real timestamped state from the backend, never fabricated locally */}
        <Card>
          <View style={styles.punchRow}>
            <View>
              <Text style={typography.label}>Attendance</Text>
              {today.status === 'loading' ? (
                <Text style={styles.punchStatusMuted}>Checking…</Text>
              ) : (
                <Text style={[styles.punchStatus, { color: punchedIn ? colors.success : colors.danger }]}>
                  {punchedIn ? `Punched in at ${new Date(today.data.punchInAt).toLocaleTimeString()}` : 'Not punched in'}
                </Text>
              )}
            </View>
            <Button
              title={punchedIn ? 'Punch Out' : 'Punch In'}
              variant={punchedIn ? 'danger' : 'primary'}
              loading={punchBusy}
              disabled={today.status === 'loading'}
              onPress={handlePunch}
              style={styles.punchBtn}
            />
          </View>
          <ErrorBanner message={punchError} />
        </Card>

        <Text style={typography.label}>Quick actions</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="📋" label="Log Call" onPress={() => navigation.navigate('DcrTab')} />
          <QuickAction icon="📅" label="MTP" onPress={() => navigation.navigate('MtpTab')} />
          <QuickAction icon="💰" label="Expenses" onPress={() => navigation.navigate('MoreTab', { screen: 'Expenses' })} />
          <QuickAction icon="📌" label="Work Type" onPress={() => navigation.navigate('MoreTab', { screen: 'WorkType' })} />
        </View>

        <Text style={typography.label}>Today</Text>
        {dashboard.status === 'loading' && <LoadingView />}
        {dashboard.status === 'error' && <ErrorBanner message={dashboard.error} />}
        {dashboard.status === 'success' && (
          <Card>
            <View style={styles.statGrid}>
              <Stat value={dashboard.data.todaysCalls} label="Calls today" />
              <Stat value={dashboard.data.pendingDcrCount} label="Pending DCR" color={colors.danger} />
              <Stat value={`₹${dashboard.data.todaysExpenseTotal}`} label="Expense today" color={colors.info} />
              <Stat value={dashboard.data.alertsCount} label="Alerts" color={colors.warning} />
            </View>
            {dashboard.data.mtpStatus && (
              <View style={styles.mtpRow}>
                <Text style={typography.body}>This month's MTP</Text>
                <Text style={[styles.mtpBadge, mtpTone(dashboard.data.mtpStatus)]}>{dashboard.data.mtpStatus}</Text>
              </View>
            )}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <Button title={`${icon}  ${label}`} variant="outline" onPress={onPress} style={styles.quickItem} />
  );
}

function Stat({ value, label, color = colors.ink }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const mtpTone = (status) => ({
  color: status === 'approved' ? colors.success : status === 'rejected' ? colors.danger : colors.warning
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { backgroundColor: colors.ink },
  heroName: { fontSize: 18, fontWeight: '700', color: colors.white },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  punchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  punchStatus: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  punchStatusMuted: { fontSize: 13, color: colors.muted, marginTop: 2 },
  punchBtn: { minWidth: 120 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickItem: { width: '47%' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  stat: { width: '50%', paddingVertical: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  mtpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm, marginTop: spacing.sm },
  mtpBadge: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }
});
