import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { colors, radii, spacing, iconSizes } from '../theme';

/** Inline error message — forms/screens render this instead of a raw stack trace. */
export default function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <CircleAlert size={iconSizes.card} color={colors.danger} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md
  },
  text: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '500' }
});
