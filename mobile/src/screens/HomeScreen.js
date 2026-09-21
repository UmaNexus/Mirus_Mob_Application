import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Stethoscope,
  Users,
  CheckCheck,
  MoreHorizontal
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../api/fieldForce';
import {
  resolveUserTier,
  displayName,
  isManagerTier
} from '../navigation/roleHelpers';
import Card from '../components/Card';
import Button from '../components/Button';
import LoadingView from '../components/LoadingView';
import ErrorBanner from '../components/ErrorBanner';
import PunchCard from '../components/PunchCard';
import BrandLogo from '../components/BrandLogo';
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

  const monthLabel = new Date().toLocaleString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  const monthKey = new Date().toISOString().slice(0, 7);

  const monitor = useAsync(
    () =>
      isManager
        ? fieldForceApi.getMonitor()
        : Promise.resolve(null),
    [isManager]
  );

  const teamPerformance = useAsync(
    () =>
      isManager
        ? fieldForceApi.getTeamPerformance(monthKey)
        : Promise.resolve(null),
    [isManager, monthKey]
  );

  useRefreshOnFocus(monitor.reload);
  useRefreshOnFocus(teamPerformance.reload);

  const refreshing = monitor.status === 'loading';

  const territoryLabel =
    user?.employeeDetails?.fieldForce?.territory || 'Zone';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={monitor.reload}
          />
        }
      >
        <Card style={styles.hero}>
          <BrandLogo variant="mark" size={28} boxed />
          <View style={styles.heroText}>
            <Text style={styles.heroName}>
              {displayName(user)}
            </Text>

            <Text style={styles.heroSub}>
              {tier
                ? `${tier} · ${
                    user?.employeeDetails?.fieldForce?.territory || 'MIRUS'
                  }`
                : 'MIRUS'}
            </Text>
          </View>
        </Card>

        {/* Every non-admin role reaches this screen (ASM/RSM/ZSM, or the
            HR/plain-employee fallback) — Admin/superadmin never do, since
            they're routed to the Executive tab bar instead. */}
        <PunchCard />

        {isManager && (
          <>
            <Text style={typography.label}>
              Team Overview
            </Text>

            {monitor.status === 'loading' && <LoadingView />}

            {monitor.status === 'error' && (
              <ErrorBanner message={monitor.error} />
            )}

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
                    color={
                      monitor.data?.pendingMtpCount > 0
                        ? colors.warning
                        : colors.ink
                    }
                  />

                  <Stat
                    value={monitor.data?.approvedMtpCount ?? 0}
                    label="Approved"
                    color={
                      monitor.data?.approvedMtpCount > 0
                        ? colors.success
                        : colors.ink
                    }
                  />

                  <Stat
                    value={monitor.data?.totalVisits ?? 0}
                    label="Total visits"
                    color={colors.ink}
                  />

                  <Stat
                    value={`${monitor.data?.dcrRate ?? 0}%`}
                    label="DCR rate"
                    color={
                      monitor.data?.dcrRate > 0
                        ? colors.warning
                        : colors.ink
                    }
                  />

                  <Stat
                    value={`${monitor.data?.mtpAdherence ?? 0}%`}
                    label="MTP adherence"
                    color={
                      monitor.data?.mtpAdherence > 0
                        ? colors.success
                        : colors.ink
                    }
                  />
                </View>
              </Card>
            )}

            <Text style={typography.label}>
              Quick actions
            </Text>

            <View style={styles.quickGrid}>
              <Button
                icon={CheckCheck}
                title="Approvals"
                variant="outline"
                onPress={() =>
                  navigation.navigate('ApprovalsTab')
                }
                style={styles.quickItem}
              />

              <Button
                icon={Users}
                title="Team"
                variant="outline"
                onPress={() =>
                  navigation.navigate('TeamTab')
                }
                style={styles.quickItem}
              />

              <Button
                icon={Stethoscope}
                title="Doctors"
                variant="outline"
                onPress={() =>
                  navigation.navigate('DoctorsTab')
                }
                style={styles.quickItem}
              />

              <Button
                icon={MoreHorizontal}
                title="More"
                variant="outline"
                onPress={() =>
                  navigation.navigate('MoreTab')
                }
                style={styles.quickItem}
              />
            </View>

            <Text style={typography.label}>
              BDM Performance
            </Text>

            {teamPerformance.status === 'loading' && (
              <LoadingView />
            )}

            {teamPerformance.status === 'error' && (
              <ErrorBanner message={teamPerformance.error} />
            )}

            {teamPerformance.status === 'success' && (
              <Card style={styles.performanceCard}>
                <View style={styles.performanceHeader}>
                  <Text style={typography.subtitle}>
                    {monthLabel}
                  </Text>
                </View>

                {(teamPerformance.data?.data || []).length === 0 ? (
                  <Text style={styles.emptyPerformance}>
                    No BDM performance data available
                  </Text>
                ) : (
                  (teamPerformance.data?.data || []).map(
                    (bdm, index) => {
                      const initials = bdm.name
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) =>
                          part[0].toUpperCase()
                        )
                        .join('');

                      const statusBackground =
                        bdm.status === 'top'
                          ? '#ECFDF5'
                          : bdm.status === 'active'
                            ? '#EFF6FF'
                            : bdm.status === 'review'
                              ? '#FFFBEB'
                              : '#FEF2F2';

                      const statusColor =
                        bdm.status === 'top'
                          ? colors.success
                          : bdm.status === 'active'
                            ? '#2563EB'
                            : bdm.status === 'review'
                              ? colors.warning
                              : colors.danger;

                      return (
                        <View
                          key={bdm.userId}
                          style={[
                            styles.performanceRow,
                            index <
                              teamPerformance.data.data
                                .length -
                                1 &&
                              styles.performanceRowBorder
                          ]}
                        >
                          <View
                            style={styles.performanceAvatar}
                          >
                            <Text
                              style={
                                styles.performanceAvatarText
                              }
                            >
                              {initials}
                            </Text>
                          </View>

                          <View
                            style={styles.performanceInfo}
                          >
                            <Text
                              style={styles.performanceName}
                            >
                              {bdm.name}
                            </Text>

                            <Text
                              style={styles.performanceMeta}
                            >
                              DCR: {bdm.dcrRate}% · MTP:{' '}
                              {bdm.mtpAdherence}%
                            </Text>

                            <View
                              style={
                                styles.performanceProgressBackground
                              }
                            >
                              <View
                                style={[
                                  styles.performanceProgressFill,
                                  {
                                    width: `${Math.min(
                                      bdm.dcrRate,
                                      100
                                    )}%`
                                  }
                                ]}
                              />
                            </View>
                          </View>

                          <View
                            style={[
                              styles.performanceStatus,
                              {
                                backgroundColor:
                                  statusBackground
                              }
                            ]}
                          >
                            <Text
                              style={[
                                styles.performanceStatusText,
                                {
                                  color: statusColor
                                }
                              ]}
                            >
                              {bdm.status === 'top'
                                ? 'Top'
                                : bdm.status === 'active'
                                  ? 'Active'
                                  : bdm.status === 'review'
                                    ? 'Review'
                                    : 'Low'}
                            </Text>
                          </View>
                        </View>
                      );
                    }
                  )
                )}
              </Card>
            )}
          </>
        )}

        {!isManager && (
          <Card style={styles.notice}>
            <Text style={typography.body}>
              Mobile foundation is set up — authentication,
              secure token storage, theming, and the API client
              are working. Your {tier || 'role'}-specific
              dashboard will land here in a later milestone.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  value,
  label,
  color = colors.ink
}) {
  return (
    <View style={styles.stat}>
      <Text
        style={[
          styles.statValue,
          { color }
        ]}
      >
        {value}
      </Text>

      <Text style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface
  },

  content: {
    padding: spacing.lg,
    gap: spacing.md
  },

  hero: {
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },

  heroText: {
    flex: 1
  },

  heroName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white
  },

  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2
  },

  notice: {
    gap: spacing.sm
  },

  /* Team Overview Card */
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

  /* Quick Actions */
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },

  quickItem: {
    width: '47%'
  },

  /* BDM Performance */
  performanceCard: {
    padding: 0,
    overflow: 'hidden'
  },

  performanceHeader: {
    padding: spacing.md,
    backgroundColor: '#F5F7FB',
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },

  performanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md
  },

  performanceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },

  performanceAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm
  },

  performanceAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB'
  },

  performanceInfo: {
    flex: 1,
    marginRight: spacing.sm
  },

  performanceName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink
  },

  performanceMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 3
  },

  performanceProgressBackground: {
    height: 7,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginTop: 7,
    overflow: 'hidden'
  },

  performanceProgressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4
  },

  performanceStatus: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5
  },

  performanceStatusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize'
  },

  emptyPerformance: {
    textAlign: 'center',
    color: colors.muted,
    padding: spacing.lg
  }
});