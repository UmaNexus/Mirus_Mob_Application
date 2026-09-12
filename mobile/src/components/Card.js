import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors, radii, shadow, spacing } from '../theme';

/**
 * Shared card surface — matches the web app's Card component's visual
 * language. Pass `onPress` to make it a tappable row (list screens); omit it
 * for a plain static surface (existing usage is unaffected).
 */
export default function Card({ children, style, onPress }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    ...shadow.card
  },
  pressed: { opacity: 0.85 }
});
