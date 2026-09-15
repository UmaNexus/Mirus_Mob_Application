import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, StyleSheet } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { colors, radii, spacing, typography, iconSizes } from '../theme';

// @react-native-community/datetimepicker has no web implementation (same
// class of gap as expo-secure-store, see tokenStorage.js) — required lazily,
// guarded by platform, so a web bundle never touches the native-only module.
// eslint-disable-next-line global-require
const DateTimePicker = Platform.OS === 'web' ? null : require('@react-native-community/datetimepicker').default;

const toDateOnly = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Labeled date picker. `value`/`onChange` use plain 'YYYY-MM-DD' strings —
 * every API in this app takes/returns dates that way, so screens never
 * juggle Date objects themselves. Falls back to a plain text field on web
 * (dev-preview only; real usage is iOS/Android where the native picker runs).
 */
export default function DateField({ label, value, onChange, placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.group}>
        {label ? <Text style={typography.label}>{label}</Text> : null}
        <TextInput
          style={styles.field}
          value={value || ''}
          onChangeText={onChange}
          placeholder={`${placeholder} (YYYY-MM-DD)`}
          placeholderTextColor={colors.muted}
        />
      </View>
    );
  }

  const handleChange = (event, selected) => {
    setOpen(Platform.OS === 'ios'); // iOS picker stays open (inline), Android closes itself
    if (event.type === 'dismissed' || !selected) return;
    onChange(toDateOnly(selected));
  };

  return (
    <View style={styles.group}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={value ? styles.valueText : styles.placeholderText}>{value || placeholder}</Text>
        <CalendarDays size={iconSizes.card} color={colors.muted} />
      </Pressable>
      {open && (
        <DateTimePicker
          value={value ? new Date(`${value}T00:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleChange}
        />
      )}
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
  placeholderText: { fontSize: 14, color: colors.muted }
});
