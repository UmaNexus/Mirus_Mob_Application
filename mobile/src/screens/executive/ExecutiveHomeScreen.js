import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarCheck, Monitor, BarChart3, MoreHorizontal, TriangleAlert } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import { resolveUserTier, displayName } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import Button from '../../components/Button';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import PunchCard from '../../components/PunchCard';
import BrandLogo from '../../components/BrandLogo';
import NotificationBell from '../../components/NotificationBell';
import { colors, spacing, typography } from '../../theme';

const TIER_LABEL = { NSM: 'NSMs', ZSM: 'ZSMs', RSM: 'RSMs', ASM: 'ASMs', BDM: 'BDMs' };

/**
 * Executive Home — NSM's own subtree, or Admin/superadmin's company-wide
 * roll-up (GET /api/field-force/org-summary, already scoped server-side).
 * Every figure below comes straight from that response — nothing here is a
 * hardcoded/prototype number.
 */
export default function ExecutiveHomeScreen({ navigation }) {
  const { user } = useAuth();
  const tier = resolveUserTier(user);
  const isAdmin = tier === 'ADMIN';

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const summary = useAsync(() => fieldForceApi.getOrgSummary(), []);
  useRefreshOnFocus(summary.reload);

  const data = summary.data;
  const tierCounts = data?.tierCounts || {};
  const tierEntries = Object.entries(tierCounts).filter(([, count]) => count > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={summary.status === 'loading'} onRefresh={summary.reload} />}
      >
        <Card style={styles.hero}>
          <BrandLogo variant="mark" size={28} boxed />
          <View style={styles.heroText}>
            <Text style={styles.heroName}>{displayName(user)}</Text>
            <Text style={styles.heroSub}>
              {isAdmin ? 'Admin · Company-wide' : `${tier} · ${user?.employeeDetails?.fieldForce?.territory || 'MIRUS'}`}
            </Text>
          </View>
          <NotificationBell
            color={colors.white}
            onPress={() => navigation.navigate('Notifications')}
          />
        </Card>

        {/* NSM punches their own attendance like everyone else; Admin/superadmin
            manage the org and don't. */}
        {!isAdmin && <PunchCard />}

        {summary.status === 'loading' && <LoadingView />}
        {summary.status === 'error' && <ErrorBanner message={summary.error} />}

        {data && (
          <>
            <Text style={typography.label}>Organization — {monthLabel}</Text>
            <Card style={styles.statCard}>
              <View style={styles.statGrid}>
                {tierEntries.map(([t, count]) => (
                  <Stat key={t} value={count} label={TIER_LABEL[t] || t} color={colors.ink} />
                ))}
              </View>
            </Card>

            <Text style={typography.label}>Today &amp; this month</Text>
            <Card style={styles.statCard}>
              <View style={styles.statGrid}>
                <Stat value={data.attendanceToday.punchedIn} label="Punched In Today" color={colors.success} />
                <Stat value={data.attendanceToday.notIn} label="Not In Today" color={colors.danger} />
                <Stat value={data.attendanceToday.onLeave} label="On Leave Today" color={colors.warning} />
                <Stat value={`${data.dcrRate}%`} label="DCR Compliance" color={colors.ink} />
                <Stat value={`${data.mtpAdherence}%`} label="MTP Adherence" color={colors.ink} />
                <Stat value={`${data.doctorCoveragePct}%`} label="Doctor Coverage" color={colors.ink} />
              </View>
            </Card>

            {(data.pendingExpenseCount > 0 || data.pendingLeaveCount > 0 || data.pendingMtpCount > 0) && (
              <Card style={styles.exceptionsCard}>
                <View style={styles.exceptionsHeader}>
                  <TriangleAlert size={16} color={colors.warning} />
                  <Text style={styles.exceptionsTitle}>Pending across the organization</Text>
                </View>
                {data.pendingExpenseCount > 0 && <Text style={styles.exceptionRow}>{data.pendingExpenseCount} expense claim{data.pendingExpenseCount === 1 ? '' : 's'} awaiting approval</Text>}
                {data.pendingMtpCount > 0 && <Text style={styles.exceptionRow}>{data.pendingMtpCount} tour plan{data.pendingMtpCount === 1 ? '' : 's'} awaiting approval</Text>}
                {data.pendingLeaveCount > 0 && <Text style={styles.exceptionRow}>{data.pendingLeaveCount} leave request{data.pendingLeaveCount === 1 ? '' : 's'} awaiting approval</Text>}
              </Card>
            )}
          </>
        )}

        <Text style={typography.label}>Quick actions</Text>
        <View style={styles.quickGrid}>
          <Button icon={CalendarCheck} title="Attendance" variant="outline" onPress={() => navigation.navigate('ExecutiveAttendanceTab')} style={styles.quickItem} />
          <Button icon={Monitor} title="Monitor" variant="outline" onPress={() => navigation.navigate('ExecutiveMonitorTab')} style={styles.quickItem} />
          <Button icon={BarChart3} title="Reports" variant="outline" onPress={() => navigation.navigate('ExecutiveReportsTab')} style={styles.quickItem} />
          <Button icon={MoreHorizontal} title="More" variant="outline" onPress={() => navigation.navigate('ExecutiveMoreTab')} style={styles.quickItem} />
        </View>
      </ScrollView>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1 },
  heroName: { fontSize: 18, fontWeight: '700', color: colors.white },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statCard: { gap: spacing.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  stat: { width: '33.33%', alignItems: 'center', paddingHorizontal: spacing.xs },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
  exceptionsCard: { gap: spacing.xs, backgroundColor: colors.warningSoft, borderColor: colors.warning },
  exceptionsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  exceptionsTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  exceptionRow: { fontSize: 12, color: colors.ink },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickItem: { width: '47%' }
});
