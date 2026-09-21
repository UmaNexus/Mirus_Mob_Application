import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as mtpApi from '../../api/mtp';
import * as holidaysApi from '../../api/holidays';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';
import {
  monthKey, daysInMonth, firstWeekdayMonFirst, monthLabel, rangeLabel,
  datesBetween, blocksFromVisits, isWeekend
} from '../../utils/mtpBlocks';

// HRMS holidays are shown in red everywhere — reusing the shared danger
// tokens rather than a separate holiday color.
const HOLIDAY_COLOR = colors.danger;
const HOLIDAY_SOFT = colors.dangerSoft;

const TONE_BY_STATUS = { draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };
const BLOCK_PALETTE = [
  { soft: colors.successSoft, solid: colors.success },
  { soft: colors.infoSoft, solid: colors.info },
  { soft: colors.warningSoft, solid: colors.warning },
  { soft: colors.dangerSoft, solid: colors.danger }
];

/**
 * Monthly Tour Plan history: a BDM may hold several independent tour
 * submissions within one month (see MonthlyTourPlan — no longer unique per
 * BDM/month), so this always lists every one of them for the selected
 * month, each with its own status — never a single collapsed "month
 * status". Tapping a tour opens TourDetailScreen for it; "+ Create New
 * Tour" opens a fresh one, leaving every existing tour untouched.
 */
export default function MtpScreen({ navigation }) {
  const [cursor, setCursor] = useState(new Date());
  const month = monthKey(cursor);

  const plans = useAsync(() => mtpApi.listMine(month), [month]);
  useRefreshOnFocus(plans.reload);
  const shiftMonth = (delta) => setCursor((prev) => { const next = new Date(prev); next.setMonth(next.getMonth() + delta); return next; });

  const year = Number(month.split('-')[0]);
  const holidaysQuery = useAsync(() => holidaysApi.listHolidays(year), [year]);
  const holidayDates = useMemo(
    () => new Set((holidaysQuery.data || []).filter((h) => h.dateKey.startsWith(month)).map((h) => h.dateKey)),
    [holidaysQuery.data, month]
  );

  const tours = useMemo(() => (plans.data || []).map((plan) => {
    const blocks = blocksFromVisits(plan.plannedVisits || []);
    const dateSet = new Set();
    const areaSet = new Set();
    blocks.forEach((b) => {
      datesBetween(b.startDate, b.endDate).forEach((d) => dateSet.add(d));
      areaSet.add(b.area);
    });
    const sortedBlocks = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const overallRange = sortedBlocks.length
      ? rangeLabel(sortedBlocks[0].startDate, sortedBlocks[sortedBlocks.length - 1].endDate)
      : null;
    return { plan, blocks: sortedBlocks, tourDays: dateSet.size, areas: [...areaSet], overallRange };
  }), [plans.data]);

  const allBlocksForCalendar = useMemo(
    () => tours.flatMap((t, tourIdx) => t.blocks.map((b) => ({ ...b, tourIdx }))),
    [tours]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous month">
          <ChevronLeft size={iconSizes.header} color={colors.primary} />
        </Pressable>
        <Text style={typography.title}>{monthLabel(month)}</Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next month">
          <ChevronRight size={iconSizes.header} color={colors.primary} />
        </Pressable>
      </View>

      {plans.status === 'loading' && <LoadingView />}
      {plans.status === 'error' && <ErrorBanner message={plans.error} />}

      {plans.status === 'success' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={tours}
          keyExtractor={(t) => t.plan._id}
          ListHeaderComponent={
            <>
              <CalendarGrid month={month} blocks={allBlocksForCalendar} holidayDates={holidayDates} />
              <Button icon={Plus} title="Create New Tour" onPress={() => navigation.navigate('TourDetail', { month })} style={styles.createBtn} />
              <Text style={[typography.label, styles.listLabel]}>Tour plans for {monthLabel(month)} ({tours.length})</Text>
            </>
          }
          ListEmptyComponent={<EmptyState icon={CalendarDays} title="No tours yet for this month" subtitle="Tap Create New Tour to plan your first one." />}
          renderItem={({ item }) => (
            <Card style={styles.tourCard} onPress={() => navigation.navigate('TourDetail', { plan: item.plan })}>
              <View style={styles.tourTop}>
                <Text style={styles.tourRange}>{item.overallRange || 'No dates yet'}</Text>
                <StatusBadge label={item.plan.status} tone={TONE_BY_STATUS[item.plan.status]} />
              </View>
              <Text style={styles.tourArea}>{item.areas.join(', ') || 'No area yet'}</Text>
              <Text style={styles.tourMeta}>
                {item.tourDays} tour day{item.tourDays === 1 ? '' : 's'} · {item.areas.length} area{item.areas.length === 1 ? '' : 's'}
              </Text>
              {item.blocks.length > 1 && (
                <Text style={styles.tourRangesHint}>{item.blocks.length} date ranges in this tour</Text>
              )}
              <View style={styles.viewDetailsRow}>
                <Text style={styles.viewDetails}>View Details</Text>
                <ChevronRight size={iconSizes.action} color={colors.primary} />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Renders one calendar week (7 equal-width cells) — every column is a plain
 * `flex: 1` child, so column width is always (container width - gaps) / 7,
 * whatever that container width actually is (phone or Expo Web) — never a
 * fixed/hardcoded pixel or percentage value that can round unevenly.
 */
function WeekRow({ week, month, treatmentFor, holidayDates }) {
  return (
    <View style={styles.weekRow}>
      {week.map((day, dayIdx) => {
        if (!day) return <View key={`blank-${dayIdx}`} style={styles.cell} />;
        const dateKey = `${month}-${String(day).padStart(2, '0')}`;
        const t = treatmentFor(dateKey);
        const isEdge = t && (t.edge === 'start' || t.edge === 'end' || t.edge === 'both');
        const weekend = isWeekend(dateKey);
        const holiday = holidayDates?.has(dateKey);
        return (
          <View
            key={dateKey}
            style={[
              styles.cell, styles.dayCell,
              t && { backgroundColor: t.soft },
              isEdge && { backgroundColor: t.solid },
              weekend && !t && styles.weekendCell,
              holiday && styles.holidayCell
            ]}
          >
            <Text style={[styles.dayText, isEdge && styles.dayTextOnSolid, weekend && !isEdge && styles.weekendText, holiday && !isEdge && styles.holidayText]}>{day}</Text>
            {t?.edge !== 'mid' && t?.edge !== 'end' && t && (
              <Text style={[styles.areaTag, isEdge && styles.areaTagOnSolid]} numberOfLines={1} ellipsizeMode="tail">{t.area}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function CalendarGrid({ month, blocks, holidayDates }) {
  const [year, m] = month.split('-').map(Number);
  const total = daysInMonth(year, m);
  const leading = firstWeekdayMonFirst(year, m);
  const cells = [...Array(leading).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  // Pad the trailing edge so every row has exactly 7 cells (keeps the grid a
  // clean rectangle of equal-width columns) — purely a rendering nicety,
  // never affects which weekday any real day falls under.
  const trailing = (7 - (cells.length % 7)) % 7;
  const paddedCells = [...cells, ...Array(trailing).fill(null)];
  const weeks = [];
  for (let i = 0; i < paddedCells.length; i += 7) weeks.push(paddedCells.slice(i, i + 7));

  const treatmentFor = (dateKey) => {
    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i];
      if (dateKey >= b.startDate && dateKey <= b.endDate) {
        const edge = b.startDate === b.endDate ? 'both' : dateKey === b.startDate ? 'start' : dateKey === b.endDate ? 'end' : 'mid';
        const palette = BLOCK_PALETTE[b.tourIdx % BLOCK_PALETTE.length];
        return { edge, ...palette, area: b.area };
      }
    }
    return null;
  };

  return (
    <Card style={styles.calendarCard}>
      <View style={styles.weekHeader}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, idx) => (
          <Text key={d} style={[styles.weekHeaderText, idx >= 5 && styles.weekendHeaderText]}>{d}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {weeks.map((week, weekIdx) => (
          <WeekRow key={weekIdx} week={week} month={month} treatmentFor={treatmentFor} holidayDates={holidayDates} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },

  // Every column below is a plain `flex: 1` sibling in a `flexDirection: 'row'`
  // — width is always (card width - gaps) / 7, computed by the layout engine
  // from whatever the calendar card's actual width is (phone or Expo Web),
  // never a fixed/hardcoded pixel value or a `%` that has to fight `gap`.
  calendarCard: { marginBottom: spacing.md },
  weekHeader: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  weekHeaderText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.muted },
  weekendHeaderText: { color: colors.primary },
  grid: { gap: spacing.xs },
  weekRow: { flexDirection: 'row', gap: spacing.xs },
  cell: {
    flex: 1,
    minHeight: 48, // a comfortable, stable touch target regardless of screen width
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  dayCell: {},
  dayText: { fontSize: 13, color: colors.ink },
  dayTextOnSolid: { color: colors.white, fontWeight: '700' },
  weekendCell: { backgroundColor: colors.surface, opacity: 0.55 },
  weekendText: { color: colors.muted },
  holidayCell: { backgroundColor: HOLIDAY_SOFT, borderWidth: 1, borderColor: HOLIDAY_COLOR, opacity: 1 },
  holidayText: { color: HOLIDAY_COLOR, fontWeight: '700' },
  areaTag: { fontSize: 9, color: colors.ink, marginTop: 2, maxWidth: '100%' },
  areaTagOnSolid: { color: colors.white },

  createBtn: { marginBottom: spacing.md },
  listLabel: { marginBottom: spacing.xs },

  tourCard: { gap: 4 },
  tourTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tourRange: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tourArea: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  tourMeta: { fontSize: 12, color: colors.muted },
  tourRangesHint: { fontSize: 11, color: colors.muted, fontStyle: 'italic' },
  viewDetailsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  viewDetails: { fontSize: 12, color: colors.primary, fontWeight: '700' }
});
