import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAsync } from '../hooks/useAsync';
import * as holidaysApi from '../api/holidays';
import { colors, radii, spacing, typography } from '../theme';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const HOLIDAY_COLOR = colors.danger;
const HOLIDAY_SOFT = colors.dangerSoft;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const pad2 = (n) => String(n).padStart(2, '0');
const toDateKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/**
 * Universal DateField with integrated calendar picker button & modal.
 * Works seamlessly across Web, iOS, and Android without native binary dependencies.
 * Provides a visible Calendar Button that opens an interactive calendar view for date selection.
 */
export default function DateField({ label, value, onChange, placeholder = 'YYYY-MM-DD', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  const openPicker = () => {
    if (disabled) return;
    const initial = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date();
    if (!Number.isNaN(initial.getTime())) {
      setViewYear(initial.getFullYear());
      setViewMonth(initial.getMonth());
    } else {
      const now = new Date();
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth());
    }
    setOpen(true);
  };

  const closePicker = () => setOpen(false);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day) => {
    const selected = toDateKey(viewYear, viewMonth, day);
    onChange(selected);
    setOpen(false);
  };

  const handleSelectToday = () => {
    const now = new Date();
    const todayStr = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
    onChange(todayStr);
    setOpen(false);
  };

  // Build calendar matrix
  const { blanks, days, firstDay } = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    return {
      firstDay: firstDayOfWeek,
      blanks: Array.from({ length: firstDayOfWeek }, (_, i) => i),
      days: Array.from({ length: totalDays }, (_, i) => i + 1)
    };
  }, [viewYear, viewMonth]);

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  // HRMS holidays — the same existing GET /api/holidays every calendar in
  // the app now shares; refetched only when the picker's viewed year changes.
  const holidaysQuery = useAsync(() => holidaysApi.listHolidays(viewYear), [viewYear]);
  const monthPrefix = `${viewYear}-${pad2(viewMonth + 1)}`;
  const holidaySet = useMemo(
    () => new Set((holidaysQuery.data || []).filter((h) => h.dateKey?.startsWith(monthPrefix)).map((h) => h.dateKey)),
    [holidaysQuery.data, monthPrefix]
  );

  return (
    <View style={styles.group}>
      {label ? <Text style={typography.label}>{label}</Text> : null}

      <View style={[styles.fieldContainer, disabled && styles.disabled]}>
        <TextInput
          style={styles.input}
          value={value || ''}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          editable={!disabled}
        />
        <Pressable
          style={({ pressed }) => [
            styles.calendarBtn,
            pressed && styles.calendarBtnPressed
          ]}
          onPress={openPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Open calendar"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <CalendarDays size={18} color={colors.primary} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closePicker}>
        <Pressable style={styles.backdrop} onPress={closePicker}>
          <Pressable style={styles.modalCard} onPress={(e) => e?.stopPropagation?.()}>
            {/* Header */}
            <View style={styles.calendarHeader}>
              <Pressable style={styles.navBtn} onPress={prevMonth} hitSlop={8}>
                <ChevronLeft size={20} color={colors.ink} />
              </Pressable>
              <Text style={styles.calendarMonthTitle}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Pressable style={styles.navBtn} onPress={nextMonth} hitSlop={8}>
                <ChevronRight size={20} color={colors.ink} />
              </Pressable>
            </View>

            {/* Weekdays Row */}
            <View style={styles.weekdaysRow}>
              {WEEKDAYS.map((w, idx) => (
                <View key={idx} style={styles.weekdayCell}>
                  <Text style={styles.weekdayText}>{w}</Text>
                </View>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
              {blanks.map((b) => (
                <View key={`blank-${b}`} style={styles.dayCell} />
              ))}
              {days.map((day) => {
                const dateKey = toDateKey(viewYear, viewMonth, day);
                const isSelected = dateKey === value;
                const isToday = dateKey === todayKey;
                const dow = (firstDay + day - 1) % 7; // 0 = Sun … 6 = Sat, matches WEEKDAYS above
                const weekend = dow === 0 || dow === 6;
                const holiday = holidaySet.has(dateKey);

                return (
                  <View key={`day-${day}`} style={styles.dayCell}>
                    <Pressable
                      style={[
                        styles.dayBtn,
                        weekend && !holiday && !isSelected && styles.dayBtnWeekend,
                        holiday && !isSelected && styles.dayBtnHoliday,
                        isSelected && !holiday && styles.dayBtnSelected,
                        isSelected && holiday && styles.dayBtnSelectedHoliday,
                        isToday && !isSelected && !holiday && styles.dayBtnToday
                      ]}
                      onPress={() => handleSelectDay(day)}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          weekend && !holiday && !isSelected && styles.dayTextWeekend,
                          holiday && !isSelected && styles.dayTextHoliday,
                          isSelected && !holiday && styles.dayTextSelected,
                          isSelected && holiday && styles.dayTextSelectedHoliday,
                          isToday && !isSelected && !holiday && styles.dayTextToday
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {/* Footer */}
            <View style={styles.calendarFooter}>
              <Pressable style={styles.footerActionBtn} onPress={handleSelectToday}>
                <Text style={styles.todayBtnText}>Today</Text>
              </Pressable>
              <Pressable style={styles.footerActionBtn} onPress={closePicker}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    minHeight: 48,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs
  },
  disabled: { opacity: 0.5 },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    paddingVertical: spacing.sm
  },
  calendarBtn: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs
  },
  calendarBtnPressed: {
    opacity: 0.7
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs
  },
  navBtn: {
    padding: spacing.xs,
    borderRadius: radii.sm
  },
  calendarMonthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink
  },
  weekdaysRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center'
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2
  },
  dayBtn: {
    width: '88%',
    height: '88%',
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayBtnSelected: {
    backgroundColor: colors.primary
  },
  dayBtnToday: {
    borderWidth: 1.5,
    borderColor: colors.primary
  },
  dayBtnWeekend: {
    opacity: 0.5
  },
  dayBtnHoliday: {
    backgroundColor: HOLIDAY_SOFT,
    borderWidth: 1.5,
    borderColor: HOLIDAY_COLOR
  },
  // A holiday that's also selected stays red (not the usual orange fill) —
  // holiday styling must remain clearly distinguishable when selected.
  dayBtnSelectedHoliday: {
    backgroundColor: HOLIDAY_COLOR
  },
  dayText: {
    fontSize: 13,
    color: colors.ink
  },
  dayTextSelected: {
    color: colors.white,
    fontWeight: '700'
  },
  dayTextToday: {
    color: colors.primary,
    fontWeight: '700'
  },
  dayTextWeekend: {
    color: colors.muted
  },
  dayTextHoliday: {
    color: HOLIDAY_COLOR,
    fontWeight: '700'
  },
  dayTextSelectedHoliday: {
    color: colors.white,
    fontWeight: '700'
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  footerActionBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  todayBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted
  }
});
