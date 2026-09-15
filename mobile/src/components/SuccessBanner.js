import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { colors, radii, spacing, iconSizes } from '../theme';

/** Inline confirmation message — the success-tone sibling of ErrorBanner. */
export default function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <CircleCheck size={iconSizes.card} color={colors.success} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.successSoft, borderRadius: radii.md, borderWidth: 1, borderColor: colors.success, padding: spacing.md },
  text: { flex: 1, color: colors.success, fontSize: 13, fontWeight: '500' }
});
