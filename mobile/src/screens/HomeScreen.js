import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stethoscope, Users, CheckCheck, MoreHorizontal } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../api/fieldForce';
import { resolveUserTier, displayName, isManagerTier } from '../navigation/roleHelpers';
import Card from '../components/Card';
import Button from '../components/Button';
import LoadingView from '../components/LoadingView';
import ErrorBanner from '../components/ErrorBanner';
import { colors, spacing, typography } from '../theme';

/**
 * Manager Home Screen. Displays the authenticated manager's profile,
 * the 6-field Team Overview card styled consistently with the rest of the app,
 * and quick access to Approvals, Team, Doctors, and More.
 */
export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const tier = resolveUserTier(user);
  const isManager = isManagerTier(user);

  const monitor = useAsync(
    () => (isManager ? fieldForceApi.getMonitor() : Promise.resolve(null)),
    [isManager]
  );
  useRefreshOnFocus(monitor.reload);

  const refreshing = monitor.status === 'loading';

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const territoryLabel = user?.employeeDetails?.fieldForce?.territory || 'Zone';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={monitor.reload} />}
      >
        <Card style={styles.hero}>
          <Text style={styles.heroName}>{displayName(user)}</Text>
          <Text style={styles.heroSub}>
            {tier ? `${tier} · ${user?.employeeDetails?.fieldForce?.territory || 'MIRUS'}` : 'MIRUS'}
          </Text>
        </Card>

        {isManager && (
          <>
            <Text style={typography.label}>Team Overview</Text>
            {monitor.status === 'loading' && <LoadingView />}
            {monitor.status === 'error' && <ErrorBanner message={monitor.error} />}

            {monitor.status === 'success' && monitor.data && (
              <Card style={styles.overviewCard}>
                <View style={styles.overviewHeader}>
                  <Text style={typography.subtitle}>
                    {monthLabel} · {territoryLabel}
                  </Text>
                </View>

                <View style={styles.statGrid}>
                  <Stat
                    value={monitor.data?.bdmCount ?? 0}
                    label="BDMs"
                    color={colors.ink}
                  />
                  <Stat
                    value={monitor.data?.pendingMtpCount ?? 0}
                    label="Pending MTP"
                    color={monitor.data?.pendingMtpCount > 0 ? colors.warning : colors.ink}
                  />
                  <Stat
                    value={monitor.data?.approvedMtpCount ?? 0}
                    label="Approved"
                    color={monitor.data?.approvedMtpCount > 0 ? colors.success : colors.ink}
                  />
                  <Stat
                    value={monitor.data?.totalVisits ?? 0}
                    label="Total visits"
                    color={colors.ink}
                  />
                  <Stat
                    value={`${monitor.data?.dcrRate ?? 0}%`}
                    label="DCR rate"
                    color={monitor.data?.dcrRate > 0 ? colors.warning : colors.ink}
                  />
                  <Stat
                    value={`${monitor.data?.mtpAdherence ?? 0}%`}
                    label="MTP adherence"
                    color={monitor.data?.mtpAdherence > 0 ? colors.success : colors.ink}
                  />
                </View>
              </Card>
            )}

            <Text style={typography.label}>Quick actions</Text>
            <View style={styles.quickGrid}>
              <Button
                icon={CheckCheck}
                title="Approvals"
                variant="outline"
                onPress={() => navigation.navigate('ApprovalsTab')}
                style={styles.quickItem}
              />
              <Button
                icon={Users}
                title="Team"
                variant="outline"
                onPress={() => navigation.navigate('TeamTab')}
                style={styles.quickItem}
              />
              <Button
                icon={Stethoscope}
                title="Doctors"
                variant="outline"
                onPress={() => navigation.navigate('DoctorsTab')}
                style={styles.quickItem}
              />
              <Button
                icon={MoreHorizontal}
                title="More"
                variant="outline"
                onPress={() => navigation.navigate('MoreTab')}
                style={styles.quickItem}
              />
            </View>
          </>
        )}

        {!isManager && (
          <Card style={styles.notice}>
            <Text style={typography.body}>
              Mobile foundation is set up — authentication, secure token storage, theming, and the API client are
              working. Your {tier || 'role'}-specific dashboard will land here in a later milestone.
            </Text>
          </Card>
        )}
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
  hero: { backgroundColor: colors.ink },
  heroName: { fontSize: 18, fontWeight: '700', color: colors.white },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  notice: { gap: spacing.sm },

  // Team Overview Card (Consistent with app theme)
  overviewCard: {
    gap: spacing.md
  },
  overviewHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.sm
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.lg
  },
  stat: {
    width: '33.33%',
    alignItems: 'center',
    paddingHorizontal: spacing.xs
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700'
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: spacing.xs,
    textAlign: 'center'
  },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickItem: { width: '47%' }
});
