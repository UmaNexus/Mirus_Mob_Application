import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

/** Labeled text input — the standard form row every screen's form uses. */
export default function FormField({ label, style, inputStyle, ...inputProps }) {
  return (
    <View style={[styles.group, style]}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <TextInput style={[styles.input, inputStyle]} placeholderTextColor={colors.muted} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface
  }
});
