import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Gift, Umbrella, Briefcase, Route, Clock3 } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import { monthKey, daysInMonth, firstWeekdayMonFirst, monthLabel, isWeekend } from '../../utils/mtpBlocks';
import Card from '../../components/Card';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// HRMS holidays are shown in red everywhere in the app — reusing the shared
// danger/dangerSoft tokens rather than inventing a separate holiday color.
const HOLIDAY_COLOR = colors.danger;
const HOLIDAY_SOFT = colors.dangerSoft;
const todayKey = () => new Date().toISOString().slice(0, 10);
const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10);

const fullDateLabel = (dateKey) => new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/**
 * Renders the raw Attendance/Leave/Holiday/WorkType/MonthlyTourPlan data
 * from GET /api/field-force/calendar as a real Mon-first month grid.
 * Merging into per-day markers and picking which background color "wins" on
 * a given day (holiday > leave > logged activity) is a presentation choice
 * made here in the client — the backend deliberately returns the raw
 * sources rather than dictating one. Weekend/today styling and marker dots
 * are computed from the real calendar for the displayed month/year — never
 * hardcoded dates — so they stay correct across every month and year.
 */
export default function CalendarScreen() {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const month = monthKey(cursor);
  const calendar = useAsync(() => fieldForceApi.getCalendar(month), [month]);
  useRefreshOnFocus(calendar.reload);

  const shiftMonth = (delta) => {
    setCursor((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  };

  const byDate = useMemo(() => {
    const map = new Map();
    const mark = (dateKey, info) => map.set(dateKey, { ...(map.get(dateKey) || {}), ...info });
    if (calendar.status !== 'success') return map;

    (calendar.data.holidays || []).forEach((h) => mark(h.dateKey, { holiday: h }));
    (calendar.data.attendance || []).forEach((a) => mark(a.dateKey, { attendance: a }));
    (calendar.data.workTypes || []).forEach((w) => mark(w.dateKey, { workType: w }));
    (calendar.data.leaves || []).forEach((l) => {
      let d = new Date(l.fromDate);
      const end = new Date(l.toDate);
      while (d <= end) {
        mark(dateKeyOf(d), { leave: l });
        d = new Date(d.getTime() + 86400000);
      }
    });
    (calendar.data.tourPlans || []).forEach((plan) => {
      (plan.plannedVisits || []).forEach((v) => {
        const dateKey = dateKeyOf(v.date);
        const existing = map.get(dateKey);
        const tours = [...(existing?.tours || []), v.area || 'Planned area'];
        mark(dateKey, { tours });
      });
    });
    return map;
  }, [calendar.status, calendar.data]);

  const days = useMemo(() => {
    if (calendar.status !== 'success') return [];
    const [year, m] = month.split('-').map(Number);
    const totalDays = daysInMonth(year, m);
    const leadingBlanks = firstWeekdayMonFirst(year, m);
    const cells = Array.from({ length: leadingBlanks }, (_, i) => ({ blank: true, key: `blank-${i}` }));
    for (let day = 1; day <= totalDays; day += 1) {
      const dateKey = `${month}-${String(day).padStart(2, '0')}`;
      cells.push({ blank: false, key: dateKey, day, dateKey, isWeekend: isWeekend(dateKey), info: byDate.get(dateKey) });
    }
    return cells;
  }, [calendar.status, month, byDate]);

  const selectedInfo = byDate.get(selectedDate);
  const selectedInMonth = selectedDate.startsWith(month);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Status Calendar</Text>
        <View style={styles.monthNav}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous month">
            <ChevronLeft size={iconSizes.header} color={colors.primary} />
          </Pressable>
          <Text style={typography.subtitle}>{monthLabel(month)}</Text>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next month">
            <ChevronRight size={iconSizes.header} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {calendar.status === 'loading' && <LoadingView />}
      {calendar.status === 'error' && <ErrorBanner message={calendar.error} />}

      {calendar.status === 'success' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, idx) => (
              <Text key={label} style={[styles.weekdayLabel, idx >= 5 && styles.weekendLabel]}>{label}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {days.map((cell) => {
              if (cell.blank) return <View key={cell.key} style={styles.cellTouch} />;
              const isToday = cell.dateKey === todayKey();
              const isSelected = cell.dateKey === selectedDate;
              return (
                <Pressable key={cell.key} onPress={() => setSelectedDate(cell.dateKey)} style={styles.cellTouch}>
                  <View style={[
                    styles.cell,
                    backgroundFor(cell.info, cell.isWeekend),
                    cell.info?.holiday && styles.cellHoliday,
                    isToday && styles.cellToday,
                    isSelected && styles.cellSelected
                  ]}>
                    <Text style={[styles.cellText, cell.isWeekend && styles.weekendText, cell.info?.holiday && styles.holidayText]}>{cell.day}</Text>
                    <View style={styles.dotRow}>
                      {cell.info?.holiday && <View style={[styles.dot, { backgroundColor: HOLIDAY_COLOR }]} />}
                      {cell.info?.leave && <View style={[styles.dot, { backgroundColor: colors.warning }]} />}
                      {(cell.info?.workType || cell.info?.attendance) && <View style={[styles.dot, { backgroundColor: colors.success }]} />}
                      {cell.info?.tours?.length > 0 && <View style={[styles.dot, { backgroundColor: colors.info }]} />}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Card style={styles.legend}>
            <LegendItem color={HOLIDAY_COLOR} label="Holiday" />
            <LegendItem color={colors.warning} label="Leave" />
            <LegendItem color={colors.success} label="Logged activity" />
            <LegendItem color={colors.info} label="Planned tour (MTP)" />
            <LegendItem color={colors.line} label="Weekend (faded)" />
          </Card>

          {selectedInMonth && (
            <Card style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailDate}>{fullDateLabel(selectedDate)}</Text>
                {selectedDate === todayKey() && <Text style={styles.todayBadge}>Today</Text>}
              </View>

              {!selectedInfo && <Text style={styles.emptyText}>No events for this day.</Text>}

              {selectedInfo?.holiday && (
                <DetailRow icon={Gift} color={HOLIDAY_COLOR} title={selectedInfo.holiday.name} subtitle={selectedInfo.holiday.optional ? 'Optional holiday' : 'Company holiday'} />
              )}
              {selectedInfo?.leave && (
                <DetailRow icon={Umbrella} color={colors.warning} title={`${selectedInfo.leave.type} leave`} subtitle={selectedInfo.leave.status} />
              )}
              {selectedInfo?.attendance && (
                <DetailRow
                  icon={Clock3}
                  color={colors.success}
                  title={`Attendance: ${selectedInfo.attendance.status}`}
                  subtitle={[selectedInfo.attendance.checkIn, selectedInfo.attendance.checkOut].filter(Boolean).join(' – ') || undefined}
                />
              )}
              {selectedInfo?.workType && (
                <DetailRow icon={Briefcase} color={colors.success} title={`Work type: ${selectedInfo.workType.type}`} />
              )}
              {selectedInfo?.tours?.length > 0 && (
                <DetailRow icon={Route} color={colors.info} title="Planned tour (MTP)" subtitle={selectedInfo.tours.join(', ')} />
              )}
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function backgroundFor(info, weekend) {
  if (info?.holiday) return { backgroundColor: HOLIDAY_SOFT };
  if (info?.leave) return { backgroundColor: colors.warningSoft };
  if (info?.workType || info?.attendance) return { backgroundColor: colors.successSoft };
  if (weekend) return { backgroundColor: colors.surface, opacity: 0.55 };
  return { backgroundColor: colors.surface };
}

function LegendItem({ color, label }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ icon: Icon, color, title, subtitle }) {
  return (
    <View style={styles.detailRow}>
      <Icon size={iconSizes.card} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailTitle}>{title}</Text>
        {subtitle ? <Text style={styles.detailSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  content: { padding: spacing.lg, gap: spacing.md },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.muted },
  weekendLabel: { color: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellTouch: { width: '14.28%', padding: 2 },
  cell: { aspectRatio: 1, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  cellHoliday: { borderColor: HOLIDAY_COLOR },
  cellToday: { borderWidth: 2, borderColor: colors.primary },
  cellSelected: { borderWidth: 2, borderColor: colors.ink },
  cellText: { fontSize: 11, fontWeight: '600', color: colors.ink },
  weekendText: { color: colors.muted },
  holidayText: { color: HOLIDAY_COLOR, fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 2, height: 5 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  legend: { gap: spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { fontSize: 12, color: colors.muted },
  detailCard: { gap: spacing.sm },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailDate: { fontSize: 14, fontWeight: '700', color: colors.ink },
  todayBadge: { fontSize: 11, fontWeight: '700', color: colors.primary },
  emptyText: { fontSize: 12, color: colors.muted },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  detailTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  detailSubtitle: { fontSize: 11, color: colors.muted, marginTop: 1 }
});
