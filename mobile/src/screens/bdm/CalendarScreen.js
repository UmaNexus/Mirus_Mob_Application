import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';

const monthKey = (d) => d.toISOString().slice(0, 7);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Renders the raw Attendance/Leave/Holiday/WorkType data from
 * GET /api/field-force/calendar as a simple month grid. Precedence for
 * which color wins on a given day (holiday > leave > logged work type >
 * plain) is a presentation choice made here in the client — the backend
 * deliberately returns the raw sources rather than dictating one, since
 * that ordering was never specified as a hard business rule.
 */
export default function CalendarScreen() {
  const [cursor, setCursor] = useState(new Date());
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

  let days = [];
  if (calendar.status === 'success') {
    const [year, m] = month.split('-').map(Number);
    const totalDays = daysInMonth(year, m);
    const byDate = new Map();
    const mark = (dateKey, info) => byDate.set(dateKey, { ...(byDate.get(dateKey) || {}), ...info });

    (calendar.data.holidays || []).forEach((h) => mark(h.dateKey, { holiday: h.name }));
    (calendar.data.attendance || []).forEach((a) => mark(a.dateKey, { attendance: a.status }));
    (calendar.data.workTypes || []).forEach((w) => mark(w.dateKey, { workType: w.type }));
    (calendar.data.leaves || []).forEach((l) => {
      let d = new Date(l.fromDate);
      const end = new Date(l.toDate);
      while (d <= end) {
        mark(d.toISOString().slice(0, 10), { leave: l.status });
        d = new Date(d.getTime() + 86400000);
      }
    });

    days = Array.from({ length: totalDays }, (_, i) => {
      const dateKey = `${month}-${String(i + 1).padStart(2, '0')}`;
      return { day: i + 1, dateKey, info: byDate.get(dateKey) };
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Status Calendar</Text>
        <View style={styles.monthNav}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous month">
            <ChevronLeft size={iconSizes.header} color={colors.primary} />
          </Pressable>
          <Text style={typography.subtitle}>{month}</Text>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next month">
            <ChevronRight size={iconSizes.header} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {calendar.status === 'loading' && <LoadingView />}
      {calendar.status === 'error' && <ErrorBanner message={calendar.error} />}

      {calendar.status === 'success' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            {days.map(({ day, info }) => (
              <View key={day} style={[styles.cell, colorFor(info)]}>
                <Text style={styles.cellText}>{day}</Text>
              </View>
            ))}
          </View>
          <Card style={styles.legend}>
            <LegendItem color={colors.success} label="Working day / logged" />
            <LegendItem color={colors.warning} label="Leave" />
            <LegendItem color="#8B5CF6" label="Holiday" />
            <LegendItem color={colors.line} label="No data" />
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function colorFor(info) {
  if (!info) return { backgroundColor: colors.surface };
  if (info.holiday) return { backgroundColor: '#EDE9FE' };
  if (info.leave) return { backgroundColor: colors.warningSoft };
  if (info.workType || info.attendance) return { backgroundColor: colors.successSoft };
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  content: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: '13%', aspectRatio: 1, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  cellText: { fontSize: 11, fontWeight: '600', color: colors.ink },
  legend: { gap: spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { fontSize: 12, color: colors.muted }
});
