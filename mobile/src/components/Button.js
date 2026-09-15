import React from 'react';
import { Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radii, typography, spacing, iconSizes } from '../theme';

const VARIANTS = {
  primary: { bg: colors.primary, fg: colors.white, border: 'transparent' },
  outline: { bg: 'transparent', fg: colors.ink, border: colors.line },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' }
};

/**
 * Shared button — every screen uses this instead of ad hoc styled Pressables.
 * `icon` (optional) is a lucide-react-native component, e.g. `icon={Plus}` —
 * only pass one when it genuinely helps the action stand out (create/edit/
 * delete/submit), not on every button.
 */
export default function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, icon: Icon, style, accessibilityLabel }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border, opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1 },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.content}>
          {Icon ? <Icon size={iconSizes.button} color={v.fg} /> : null}
          <Text style={[typography.button, { color: v.fg }]}>{title}</Text>
        </View>
      )}
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
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }
});
