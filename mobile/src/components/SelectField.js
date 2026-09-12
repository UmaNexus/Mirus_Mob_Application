import React, { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

/**
 * Labeled tap-to-open picker (a bottom-sheet-style modal list) — used
 * everywhere a screen needs the user to choose from a small/medium set of
 * options (category, station type, doctor, work type, accompanying manager).
 * `options` is [{ label, value }]; `value` is the currently selected value.
 */
export default function SelectField({ label, value, options, onChange, placeholder = 'Select…', disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.group}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={[styles.field, disabled && styles.disabled]}
        accessibilityRole="button"
      >
        <Text style={selected ? styles.valueText : styles.placeholderText}>{selected ? selected.label : placeholder}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => { onChange(item.value); setOpen(false); }}
                >
                  <Text style={item.value === value ? styles.optionTextSelected : styles.optionText}>{item.label}</Text>
                  {item.sublabel ? <Text style={styles.optionSub}>{item.sublabel}</Text> : null}
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
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
  disabled: { opacity: 0.5 },
  valueText: { fontSize: 14, color: colors.ink },
  placeholderText: { fontSize: 14, color: colors.muted },
  chevron: { color: colors.primary, fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '60%', padding: spacing.sm },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  optionSelected: { backgroundColor: colors.primarySoft, borderRadius: radii.md },
  optionText: { fontSize: 14, color: colors.ink },
  optionTextSelected: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  optionSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  separator: { height: 1, backgroundColor: colors.line }
});
