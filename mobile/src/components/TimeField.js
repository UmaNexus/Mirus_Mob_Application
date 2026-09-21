import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import { colors, radii, spacing, typography, iconSizes } from '../theme';

// @react-native-community/datetimepicker has no web implementation at all
// (same gap as DateField.js) — required lazily, guarded by platform. On web
// WheelTimePicker below (plain RN components, works via react-native-web)
// stands in so the "alarm app" scrollable-wheel feel is the same everywhere,
// not just on a native device/simulator.
// eslint-disable-next-line global-require
const DateTimePicker = Platform.OS === 'web' ? null : require('@react-native-community/datetimepicker').default;

const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

/** One scrollable, snap-to-item wheel column (hour / minute / AM-PM). */
function WheelColumn({ items, selectedIndex, onChange, width = 56 }) {
  const ref = useRef(null);
  const settling = useRef(false);

  useEffect(() => {
    // Only jump to position on mount / when opened — not on every re-render
    // from the parent, or a user's own scroll would keep getting overridden.
    ref.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapTo = (idx) => {
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    settling.current = true;
    ref.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
    onChange(clamped);
    setTimeout(() => { settling.current = false; }, 250);
  };

  const handleEnd = (e) => {
    if (settling.current) return;
    snapTo(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT));
  };

  return (
    <View style={[styles.wheelColumn, { width }]}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PADDING }}
        onMomentumScrollEnd={handleEnd}
        onScrollEndDrag={handleEnd}
      >
        {items.map((label, idx) => (
          <Pressable
            key={label}
            style={styles.wheelItem}
            onPress={() => snapTo(idx)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: idx === selectedIndex }}
          >
            <Text style={idx === selectedIndex ? styles.wheelTextSelected : styles.wheelText}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** The alarm-clock-style hour / minute / AM-PM wheel picker, driving a Date. */
function WheelTimePicker({ value, onChange }) {
  const hour24 = value.getHours();
  const hourIndex = (hour24 % 12 === 0 ? 12 : hour24 % 12) - 1;
  const minuteIndex = value.getMinutes();
  const periodIndex = hour24 >= 12 ? 1 : 0;

  const applyChange = (nextHourIdx, nextMinuteIdx, nextPeriodIdx) => {
    const next = new Date(value);
    let h = nextHourIdx + 1; // 1-12
    if (nextPeriodIdx === 0) h = h === 12 ? 0 : h; // AM
    else h = h === 12 ? 12 : h + 12; // PM
    next.setHours(h, nextMinuteIdx, 0, 0);
    onChange(next);
  };

  return (
    <View style={styles.wheelRow}>
      <WheelColumn items={HOURS} selectedIndex={hourIndex} onChange={(i) => applyChange(i, minuteIndex, periodIndex)} />
      <Text style={styles.wheelColon}>:</Text>
      <WheelColumn items={MINUTES} selectedIndex={minuteIndex} onChange={(i) => applyChange(hourIndex, i, periodIndex)} />
      <WheelColumn items={PERIODS} selectedIndex={periodIndex} onChange={(i) => applyChange(hourIndex, minuteIndex, i)} width={48} />
      <View style={[styles.wheelHighlight, { pointerEvents: 'none' }]} />
    </View>
  );
}

/**
 * Labeled time-of-day picker. `value`/`onChange` use full ISO datetime
 * strings — only the time-of-day is actually edited here; the date portion
 * carries over from the existing value (or "now") since a DCR's start/end
 * time always belongs to the call's own date.
 *
 * Opens a bottom sheet with a scrollable hour/minute/AM-PM wheel — the
 * familiar alarm-clock style time-setting UI — on every platform, including
 * web (native DateTimePicker has no web build at all, so web uses the
 * hand-rolled WheelTimePicker above for the same look/feel). Wheel changes
 * are staged in a draft and only committed on "Set"; "Cancel" discards them.
 */
export default function TimeField({ label, value, onChange, placeholder = 'Select time' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const openSheet = () => { setDraft(value ? new Date(value) : new Date()); setOpen(true); };
  const cancel = () => setOpen(false);
  const confirm = () => { onChange(draft.toISOString()); setOpen(false); };

  return (
    <View style={styles.group}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={openSheet} accessibilityRole="button">
        <Text style={value ? styles.valueText : styles.placeholderText}>{value ? formatTime(value) : placeholder}</Text>
        <Clock size={iconSizes.card} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={cancel}>
        <Pressable style={styles.backdrop} onPress={cancel}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            {draft && (
              Platform.OS === 'web' ? (
                <WheelTimePicker value={draft} onChange={setDraft} />
              ) : (
                <DateTimePicker
                  value={draft}
                  mode="time"
                  display="spinner"
                  // `onChange` is deprecated as of @react-native-community/datetimepicker
                  // v9 (see its index.d.ts) — the library's rewritten native side no
                  // longer fires it on every wheel tick for an inline `display="spinner"`
                  // picker (only on the old dialog's terminal set/dismiss/neutral events,
                  // which this embedded style never reaches), so `draft` never updated —
                  // the wheel visibly spun but the selected value was silently dropped.
                  // `onValueChange` is the supported replacement that fires on every
                  // actual value change, on both platforms.
                  onValueChange={(event, selectedDate) => setDraft(selectedDate)}
                  style={styles.nativeSpinner}
                />
              )
            )}
            <View style={styles.sheetActions}>
              <Pressable onPress={cancel} style={styles.sheetBtn} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.sheetBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirm} style={[styles.sheetBtn, styles.sheetBtnPrimary]} accessibilityRole="button" accessibilityLabel="Set">
                <Text style={[styles.sheetBtnText, styles.sheetBtnTextPrimary]}>Set</Text>
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
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.line, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface, minHeight: 48
  },
  valueText: { fontSize: 14, color: colors.ink },
  placeholderText: { fontSize: 14, color: colors.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg, alignItems: 'center' },
  sheetTitle: { ...typography.label, marginBottom: spacing.sm },
  nativeSpinner: { width: '100%', height: 180 },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, width: '100%' },
  sheetBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  sheetBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  sheetBtnText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  sheetBtnTextPrimary: { color: colors.white },

  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: ITEM_HEIGHT * VISIBLE_ITEMS },
  wheelColumn: { height: ITEM_HEIGHT * VISIBLE_ITEMS },
  wheelItem: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 16, color: colors.muted },
  wheelTextSelected: { fontSize: 20, fontWeight: '700', color: colors.primary },
  wheelColon: { fontSize: 20, fontWeight: '700', color: colors.ink, marginHorizontal: 2 },
  wheelHighlight: {
    position: 'absolute', left: 0, right: 0, top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    height: ITEM_HEIGHT, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line
  }
});
