import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../theme';

const TONES = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: colors.surface, fg: colors.muted }
};

/** Small pill used for status text (Pending/Approved/Rejected/Active/...). */
export default function StatusBadge({ label, tone = 'neutral' }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700' }
});
