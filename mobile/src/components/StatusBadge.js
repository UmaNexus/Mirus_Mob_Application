import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, iconSizes } from '../theme';
import { STATUS_ICON_BY_LABEL, STATUS_ICON_BY_TONE } from '../constants/statusIcons';

const TONES = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: colors.surface, fg: colors.muted }
};

/**
 * Small pill used for status text (Pending/Approved/Rejected/Active/...).
 * Resolves a leading icon automatically from `label` (falling back to a
 * tone-based icon), or accepts an explicit `icon` component to override it.
 */
export default function StatusBadge({ label, tone = 'neutral', icon }) {
  const t = TONES[tone] || TONES.neutral;
  const Icon = icon !== undefined ? icon : (STATUS_ICON_BY_LABEL[String(label).toLowerCase()] || STATUS_ICON_BY_TONE[tone]);
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={iconSizes.badge} color={t.fg} strokeWidth={2.25} /> : null}
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700' }
});
