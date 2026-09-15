import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { colors, spacing } from '../theme';

/** Real empty state — every list screen shows this instead of a blank void or fake rows. */
export default function EmptyState({ icon: Icon = Inbox, title, subtitle }) {
  return (
    <View style={styles.container}>
      <Icon size={32} color={colors.muted} strokeWidth={1.5} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: spacing.xxl, gap: spacing.xs },
  title: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'center', marginTop: spacing.xs },
  subtitle: { fontSize: 12, color: colors.muted, textAlign: 'center' }
});
