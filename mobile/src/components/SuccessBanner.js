import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../theme';

/** Inline confirmation message — the success-tone sibling of ErrorBanner. */
export default function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.successSoft, borderRadius: radii.md, borderWidth: 1, borderColor: colors.success, padding: spacing.md },
  text: { color: colors.success, fontSize: 13, fontWeight: '500' }
});
