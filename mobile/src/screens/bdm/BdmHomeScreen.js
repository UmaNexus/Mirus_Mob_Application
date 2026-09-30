import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardList, CalendarDays, Receipt, ListChecks, AlertTriangle, Palmtree, Cake, Phone, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as attendanceApi from '../../api/attendance';
import * as fieldForceApi from '../../api/fieldForce';
import * as dcrApi from '../../api/dcr';
import { displayName } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import ErrorBanner from '../../components/ErrorBanner';
import LoadingView from '../../components/LoadingView';
import PunchCard from '../../components/PunchCard';
import BrandLogo from '../../components/BrandLogo';
import NotificationBell from '../../components/NotificationBell';
import { colors, spacing, radii, typography } from '../../theme';

function isBirthdayToday(alert) {
  if (alert.isToday === true) return true;
  if (!alert.date) return false;
  const d = new Date(alert.date);
  const now = new Date();
  const localMatch = d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  const utcMatch = d.getUTCDate() === now.getUTCDate() && d.getUTCMonth() === now.getUTCMonth();
  return localMatch || utcMatch;
}

/**
 * BDM dashboard. Every number here comes from a live API call — no
 * hardcoded demo stats (today's calls, pending DCR, expense total, MTP
 * status, alert count all come from GET /api/field-force/dashboard).
 */
export default function BdmHomeScreen({ navigation, route }) {
  const { user } = useAuth();
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (route?.params?.focus === 'todaysPlan') {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 380, animated: true });
      }, 350);
    }
  }, [route?.params?.focus]);

  const today = useAsync(attendanceApi.getToday, []);
  const dashboard = useAsync(fieldForceApi.getDashboard, []);
  const alerts = useAsync(fieldForceApi.getAlerts, []);
  const dcrToday = useAsync(
  () => dcrApi.listMine({
    date: new Date().toISOString().slice(0, 10)
    }),
    []
  );

  useRefreshOnFocus(today.reload);
  useRefreshOnFocus(dashboard.reload);
  useRefreshOnFocus(alerts.reload);
  useRefreshOnFocus(dcrToday.reload);

  const activeLeave = today.data?.activeLeave;
  const isOnLeaveToday = Boolean(activeLeave || today.data?.status === 'Leave');
  const refreshing =
  today.status === 'loading' &&
  dashboard.status === 'loading' &&
  alerts.status === 'loading' &&
  dcrToday.status === 'loading';
  const todaysPlan = (dcrToday.data || []).slice(0, 3);

  const todayBirthdays = (alerts.data || []).filter(
    (a) => a.type === 'birthday' && isBirthdayToday(a)
  );
  const birthdayDoctorIdSet = new Set(
    todayBirthdays.map((b) => String(b.doctorId)).filter(Boolean)
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              today.reload();
              dashboard.reload();
              dcrToday.reload();
            }}
          />
        }
      >
        <Card style={styles.hero}>
          <BrandLogo variant="mark" size={28} boxed />
          <View style={styles.heroText}>
            <Text style={styles.heroName}>{displayName(user)}</Text>
            <Text style={styles.heroSub}>BDM · {user?.employeeDetails?.fieldForce?.territory || 'MIRUS'}</Text>
          </View>
          <NotificationBell
            color={colors.white}
            onPress={() => navigation.navigate('MoreTab', { screen: 'Alerts' })}
          />
        </Card>

        <PunchCard />

        {/* Leave Status / Apply Leave */}
        <Card style={styles.leaveCard} onPress={() => navigation.navigate('ApplyLeave')}>
          <View style={styles.leaveRow}>
            <View style={styles.leaveLeft}>
              <View style={[styles.leaveIconBox, isOnLeaveToday && styles.leaveIconBoxActive]}>
                <Palmtree size={20} color={isOnLeaveToday ? colors.success : colors.primary} />
              </View>
              <View style={styles.leaveTextGroup}>
                <Text style={styles.leaveTitle}>
                  {isOnLeaveToday ? 'On Leave Today' : 'Apply Leave'}
                </Text>
                <Text style={styles.leaveSubtitle}>
                  {isOnLeaveToday
                    ? (activeLeave?.type ? `Approved ${activeLeave.type} Leave` : 'Approved leave for today')
                    : 'Request planned or sick leave'}
                </Text>
              </View>
            </View>
            {isOnLeaveToday ? (
              <StatusBadge label="On Leave" tone="success" />
            ) : (
              <Button
                title="Apply"
                variant="outline"
                onPress={() => navigation.navigate('ApplyLeave')}
                style={styles.leaveBtn}
              />
            )}
          </View>
        </Card>

        <Card style={styles.dcrStatusCard}>
          <View style={styles.dcrStatusHeader}>
            <Text style={styles.dcrStatusTitle}>DCR STATUS</Text>
            <Text style={styles.dcrStatusMonth}>
              {new Date().toLocaleString('en-US', {
                month: 'long',
                year: 'numeric'
              })}
            </Text>
          </View>

          <View style={styles.dcrStatusRow}>
            <Text style={styles.dcrStatusLabel}>
              DCR submitted: {dashboard.data?.dcrSubmittedDays ?? 0} / {dashboard.data?.dcrWorkingDays ?? 0} days
            </Text>

            <Text style={styles.dcrStatusPercentage}>
              {dashboard.data?.dcrSubmissionPercentage ?? 0}%
            </Text>
          </View>

          <View style={styles.progressBackground}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(
                    dashboard.data?.dcrSubmissionPercentage ?? 0,
                    100
                  )}%`
                }
              ]}
            />
          </View>
        </Card>

        <Text style={typography.label}>Quick actions</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon={ClipboardList} label="DCR" onPress={() => navigation.navigate('DcrTab')} />
          <QuickAction icon={CalendarDays} label="MTP" onPress={() => navigation.navigate('MtpTab')} />
          <QuickAction icon={Receipt} label="Expenses" onPress={() => navigation.navigate('MoreTab', { screen: 'Expenses' })} />
          <QuickAction icon={ListChecks} label="Work Type" onPress={() => navigation.navigate('MoreTab', { screen: 'WorkType' })} />
        </View>
        {/* todaysPlan */}
        <Text style={typography.label}>Today's plan</Text>

        {/* Doctor Birthday Banner(s) in Today's Plan */}
        {todayBirthdays.map((b, idx) => (
          <Card
            key={b.doctorId || idx}
            style={styles.birthdayCard}
            onPress={() => {
              if (b.doctorId) {
                navigation.navigate('DoctorDetail', {
                  doctor: {
                    _id: b.doctorId,
                    name: b.name,
                    speciality: b.speciality,
                    area: b.area,
                    phone: b.phone,
                    dob: b.date
                  }
                });
              }
            }}
          >
            <View style={styles.birthdayCardContent}>
              <View style={styles.birthdayIconBox}>
                <Cake size={22} color="#D97706" />
              </View>
              <View style={styles.birthdayInfo}>
                <View style={styles.birthdayHeaderRow}>
                  <Text style={styles.birthdayBadgeText}>TODAY'S BIRTHDAY</Text>
                </View>
                <Text style={styles.birthdayDoctorName}>
                  {b.name?.startsWith('Dr') ? b.name : `Dr. ${b.name}`}
                </Text>
                <Text style={styles.birthdayDoctorMeta}>
                  {[b.speciality, b.area].filter(Boolean).join(' · ') || 'Assigned Doctor'}
                </Text>
              </View>
              {b.phone ? (
                <TouchableOpacity
                  style={styles.birthdayCallBtn}
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    Linking.openURL(`tel:${b.phone}`);
                  }}
                >
                  <Phone size={14} color="#FFFFFF" />
                  <Text style={styles.birthdayCallBtnText}>Call</Text>
                </TouchableOpacity>
              ) : (
                <ChevronRight size={18} color={colors.muted} />
              )}
            </View>
          </Card>
        ))}

        {dcrToday.status === 'loading' && <LoadingView />}

        {dcrToday.status === 'error' && (
          <ErrorBanner message={dcrToday.error} />
        )}

        {dcrToday.status === 'success' && (
          <Card>
            {todaysPlan.length === 0 ? (
              <Text style={styles.emptyPlan}>
                No calls logged today
              </Text>
            ) : (
              todaysPlan.map((item, index) => {
                const isActivity =
                  item.type === 'camp' || item.type === 'meeting';

                const title = isActivity
                  ? item.activityName
                  : item.doctorId?.name || 'Unknown doctor';

                const subtitle = isActivity
                  ? item.venue || item.type
                  : [
                      item.productsDetailed?.[0],
                      item.doctorId?.speciality
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No product noted';

                const docId = String(item.doctorId?._id || item.doctorId || '');
                const hasBirthday = Boolean(docId && birthdayDoctorIdSet.has(docId));

                return (
                  <View
                    key={item._id}
                    style={[
                      styles.planRow,
                      index < todaysPlan.length - 1 && styles.planRowBorder
                    ]}
                  >
                    <View style={styles.planInfo}>
                      <View style={styles.planTitleContainer}>
                        <Text style={styles.planTitle}>
                          {title}
                        </Text>
                        {hasBirthday && (
                          <View style={styles.planBirthdayTag}>
                            <Cake size={11} color="#B45309" />
                            <Text style={styles.planBirthdayTagText}>Birthday Today</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.planSubtitle}>
                        {subtitle}
                      </Text>
                    </View>

                    <StatusBadge
                      label={item.status}
                      tone={
                        item.status === 'pending'
                          ? 'warning'
                          : item.status === 'completed'
                            ? 'success'
                            : 'danger'
                      }
                    />
                  </View>
                );
              })
            )}
          </Card>
        )}

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
            {dashboard.data.mtpToursThisMonth > 0 && (
              <View style={styles.mtpRow}>
                <Text style={typography.body}>Tour plans this month</Text>
                <Text style={styles.mtpBadge}>
                  {dashboard.data.mtpToursThisMonth} tour{dashboard.data.mtpToursThisMonth === 1 ? '' : 's'}
                  {dashboard.data.mtpPendingThisMonth > 0 ? ` · ${dashboard.data.mtpPendingThisMonth} pending` : ''}
                </Text>
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
    <Button icon={icon} title={label} variant="outline" onPress={onPress} style={styles.quickItem} />
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
  leaveCard: { paddingVertical: spacing.md },
  leaveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leaveLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  leaveIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  leaveIconBoxActive: {
    backgroundColor: colors.successSoft
  },
  leaveTextGroup: { flex: 1 },
  leaveTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  leaveSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  leaveBtn: { minWidth: 80 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickItem: { width: '47%' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  stat: { width: '50%', paddingVertical: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  mtpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm, marginTop: spacing.sm },
  mtpBadge: { fontSize: 12, fontWeight: '700', color: colors.ink },
  dcrStatusCard: {
  marginTop: spacing.md,
},

dcrStatusHeader: {
  marginBottom: spacing.md,
},

dcrStatusTitle: {
  ...typography.caption,
  fontWeight: '700',
},

dcrStatusMonth: {
  ...typography.body,
  marginTop: spacing.xs,
},

dcrStatusRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},

dcrStatusLabel: {
  ...typography.body,
  flex: 1,
},

dcrStatusPercentage: {
  ...typography.body,
  fontWeight: '700',
},

progressBackground: {
  height: 8,
  borderRadius: 4,
  backgroundColor: '#E5E7EB',
  overflow: 'hidden',
  marginTop: spacing.sm,
},

progressFill: {
  height: '100%',
  borderRadius: 4,
  backgroundColor: '#2563EB',
},
emptyPlan: {
  fontSize: 13,
  color: colors.muted,
  textAlign: 'center',
  paddingVertical: spacing.md
},

planRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: spacing.md
},

planRowBorder: {
  borderBottomWidth: 1,
  borderBottomColor: colors.line
},

planInfo: {
  flex: 1,
  marginRight: spacing.sm
},

planTitle: {
  fontSize: 15,
  fontWeight: '700',
  color: colors.ink
},

planSubtitle: {
  fontSize: 12,
  color: colors.muted,
  marginTop: 3
},

birthdayCard: {
  backgroundColor: '#FFFBEB',
  borderColor: '#FDE68A',
  borderWidth: 1,
  borderLeftWidth: 4,
  borderLeftColor: '#F59E0B',
  marginBottom: spacing.xs,
},

birthdayCardContent: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
},

birthdayIconBox: {
  width: 42,
  height: 42,
  borderRadius: radii.md,
  backgroundColor: '#FEF3C7',
  alignItems: 'center',
  justifyContent: 'center',
},

birthdayInfo: {
  flex: 1,
},

birthdayHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 2,
},

birthdayBadgeText: {
  fontSize: 10,
  fontWeight: '700',
  color: '#B45309',
  letterSpacing: 0.5,
},

birthdayDoctorName: {
  fontSize: 15,
  fontWeight: '700',
  color: '#78350F',
},

birthdayDoctorMeta: {
  fontSize: 12,
  color: '#92400E',
  marginTop: 2,
},

birthdayCallBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  backgroundColor: '#059669',
  paddingHorizontal: spacing.sm + 2,
  paddingVertical: spacing.xs + 2,
  borderRadius: radii.sm,
},

birthdayCallBtnText: {
  color: '#FFFFFF',
  fontSize: 12,
  fontWeight: '600',
},

planTitleContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: spacing.xs,
},

planBirthdayTag: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 3,
  backgroundColor: '#FEF3C7',
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: radii.sm,
  borderWidth: 1,
  borderColor: '#FDE68A',
},

planBirthdayTagText: {
  fontSize: 10,
  fontWeight: '600',
  color: '#92400E',
},
});
