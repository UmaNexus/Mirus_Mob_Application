import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as mtpApi from '../../api/mtp';
import { displayName } from '../../navigation/roleHelpers';
import { monthKey, monthLabel, rangeLabel, blocksFromVisits, areaLookupFromPopulatedVisits } from '../../utils/mtpBlocks';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography, iconSizes } from '../../theme';

const TONE_BY_STATUS = { draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };

/**
 * ASM+ read-only roll-up of the caller's reporting subtree's tour plans
 * (GET /api/mtp/team — already scoped server-side to the caller's own
 * subtree). A single BDM may have several independent tours in the same
 * month, so these are grouped by BDM rather than deduplicated — every tour
 * keeps its own status and its own Review/View action.
 */
export default function TeamMtpScreen({ navigation }) {
  const [cursor, setCursor] = useState(new Date());
  const month = monthKey(cursor);
  const plans = useAsync(() => mtpApi.listTeam(month), [month]);
  useRefreshOnFocus(plans.reload);

  const shiftMonth = (delta) => setCursor((prev) => { const next = new Date(prev); next.setMonth(next.getMonth() + delta); return next; });

  const sections = useMemo(() => {
    const byBdm = new Map();
    (plans.data || []).forEach((plan) => {
      const bdmId = plan.userId?._id || plan.userId;
      if (!byBdm.has(bdmId)) byBdm.set(bdmId, { title: displayName(plan.userId), data: [] });
      const blocks = blocksFromVisits(plan.plannedVisits || [], areaLookupFromPopulatedVisits(plan.plannedVisits || []));
      const sorted = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate));
      const overallRange = sorted.length ? rangeLabel(sorted[0].startDate, sorted[sorted.length - 1].endDate) : null;
      byBdm.get(bdmId).data.push({ plan, areas: [...new Set(blocks.map((b) => b.area))], overallRange });
    });
    return [...byBdm.values()];
  }, [plans.data]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityLabel="Previous month" accessibilityRole="button">
          <ChevronLeft size={iconSizes.header} color={colors.primary} />
        </Pressable>
        <Text style={typography.title}>{monthLabel(month)}</Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityLabel="Next month" accessibilityRole="button">
          <ChevronRight size={iconSizes.header} color={colors.primary} />
        </Pressable>
      </View>

      {plans.status === 'loading' && <LoadingView />}
      {plans.status === 'error' && <ErrorBanner message={plans.error} />}

      <SectionList
        contentContainerStyle={styles.list}
        sections={sections}
        keyExtractor={(item) => item.plan._id}
        renderSectionHeader={({ section }) => <Text style={styles.bdmName}>{section.title}</Text>}
        ListEmptyComponent={plans.status === 'success' ? <EmptyState icon={CalendarDays} title="No tour plans for this month" /> : null}
        renderItem={({ item }) => (
          <Card style={styles.row} onPress={() => navigation.navigate('MtpReview', { plan: item.plan, bdmName: displayName(item.plan.userId) })}>
            <View style={styles.rowTop}>
              <Text style={styles.tourRange}>{item.overallRange || 'No dates yet'}</Text>
              <StatusBadge label={item.plan.status} tone={TONE_BY_STATUS[item.plan.status]} />
            </View>
            <Text style={styles.meta}>{item.areas.join(', ') || 'No area yet'}</Text>
            <View style={styles.rowBottom}>
              <Text style={styles.visitCount}>{item.plan.plannedVisits?.length || 0} visit{(item.plan.plannedVisits?.length || 0) === 1 ? '' : 's'} planned</Text>
              <Button title={item.plan.status === 'pending' ? 'Review' : 'View'} variant="ghost" onPress={() => navigation.navigate('MtpReview', { plan: item.plan, bdmName: displayName(item.plan.userId) })} />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  bdmName: { fontSize: 13, fontWeight: '700', color: colors.ink, backgroundColor: colors.surface, paddingVertical: spacing.xs },
  row: { gap: 4, marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tourRange: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  visitCount: { fontSize: 12, color: colors.muted }
});
