import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radii, typography, spacing } from '../theme';

const VARIANTS = {
  primary: { bg: colors.primary, fg: colors.white, border: 'transparent' },
  outline: { bg: 'transparent', fg: colors.ink, border: colors.line },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' }
};

/** Shared button — every screen uses this instead of ad hoc styled Pressables. */
export default function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, style }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border, opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1 },
        style
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[typography.button, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48, // accessible touch target
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg
  }
});
