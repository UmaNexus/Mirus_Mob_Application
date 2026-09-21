import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock, MapPin } from 'lucide-react-native';
import Card from '../Card';
import StatusBadge from '../StatusBadge';
import { colors, spacing, iconSizes } from '../../theme';

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const formatTime = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

function todayBadge(item) {
  if (item.status === 'leave') return <StatusBadge label="On Leave" tone="warning" />;
  if (item.status === 'in') return <StatusBadge label="Punched In" tone="success" />;
  return <StatusBadge label="Not In" tone="danger" />;
}

function rangeBadge(item) {
  if (item.status === 'leave') return <StatusBadge label="On Leave" tone="warning" />;
  if (item.presentDays > 0) return <StatusBadge label="Active" tone="success" />;
  return <StatusBadge label="No Punches" tone="neutral" />;
}

/** One attendance row — shared by `TeamAttendanceScreen` and `ExecutiveAttendanceScreen`. An optional `tier` badge distinguishes rows when the executive screen shows a mixed-tier list. */
export default function AttendanceRow({ item, period, tier }) {
  const badge = period === 'today' ? todayBadge(item) : rangeBadge(item);
  return (
    <Card style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name || 'Unnamed'}</Text>
          <View style={styles.metaRow}>
            {tier ? <Text style={styles.meta}>{tier}</Text> : null}
            {item.employeeId ? <Text style={styles.meta}>{item.employeeId}</Text> : null}
            {item.territory ? (
              <View style={styles.metaWithIcon}>
                <MapPin size={iconSizes.action} color={colors.muted} />
                <Text style={styles.meta}>{item.territory}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {badge}
      </View>
      {period === 'today' && item.punchInAt ? (
        <View style={styles.metaWithIcon}>
          <Clock size={iconSizes.action} color={colors.muted} />
          <Text style={styles.meta}>Punched in at {formatTime(item.punchInAt)}</Text>
        </View>
      ) : null}
      {period !== 'today' && item.status !== 'leave' ? (
        <Text style={styles.meta}>Present {item.presentDays}/{item.workingDays} working days</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  metaWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 11, color: colors.muted }
});
