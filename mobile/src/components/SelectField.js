import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { ChevronDown, Search } from 'lucide-react-native';
import { colors, radii, spacing, typography, iconSizes } from '../theme';

/**
 * Labeled tap-to-open picker (a bottom-sheet-style modal list) — used
 * everywhere a screen needs the user to choose from a small/medium set of
 * options (category, station type, doctor, work type, accompanying manager).
 * `options` is [{ label, value, sublabel? }]; `value` is the currently
 * selected value. Pass `searchable` for a long list (e.g. doctors) to add a
 * live filter-by-label search box at the top of the sheet.
 */
export default function SelectField({ label, value, options, onChange, placeholder = 'Select…', disabled = false, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const close = () => { setOpen(false); setQuery(''); };

  return (
    <View style={styles.group}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={[styles.field, disabled && styles.disabled]}
        accessibilityRole="button"
      >
        <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>{selected ? selected.label : placeholder}</Text>
        <ChevronDown size={iconSizes.card} color={colors.primary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {searchable && (
              <View style={styles.searchRow}>
                <Search size={iconSizes.card} color={colors.muted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search…"
                  placeholderTextColor={colors.muted}
                  autoFocus
                />
              </View>
            )}
            <FlatList
              data={visibleOptions}
              keyExtractor={(item) => String(item.value)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => { onChange(item.value); close(); }}
                >
                  <Text style={item.value === value ? styles.optionTextSelected : styles.optionText}>{item.label}</Text>
                  {item.sublabel ? <Text style={styles.optionSub}>{item.sublabel}</Text> : null}
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={<Text style={styles.emptyText}>No matches</Text>}
            />
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
  disabled: { opacity: 0.5 },
  valueText: { fontSize: 14, color: colors.ink, flex: 1, marginRight: spacing.sm },
  placeholderText: { fontSize: 14, color: colors.muted, flex: 1, marginRight: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '70%', padding: spacing.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.line, borderRadius: radii.md,
    paddingHorizontal: spacing.md, margin: spacing.xs, backgroundColor: colors.surface
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: spacing.sm },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  optionSelected: { backgroundColor: colors.primarySoft, borderRadius: radii.md },
  optionText: { fontSize: 14, color: colors.ink },
  optionTextSelected: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  optionSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  separator: { height: 1, backgroundColor: colors.line },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', padding: spacing.lg }
});
