import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stethoscope, MapPin, Pill, Package, MessageSquare, Clock, Tent, Send } from 'lucide-react-native';
import { displayName } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import { colors, spacing, typography, iconSizes } from '../../theme';

const TONE_BY_STATUS = { pending: 'warning', completed: 'success', missed: 'danger' };
const dateLabel = (dateKey) => new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/**
 * Read-only detail of one BDM's daily report — the exact rows the review
 * list already fetched (GET /api/dcr/team, hierarchy-scoped server-side) are
 * passed straight through via navigation params, so this screen makes no
 * API call of its own and duplicates no DCR business logic.
 */
export default function DcrReviewDetailScreen({ route }) {
  const { report } = route.params;
  const rows = [...report.rows].sort((a, b) => new Date(a.visitTime) - new Date(b.visitTime));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <Text style={styles.bdmName}>{displayName(report.bdm)}</Text>
          <Text style={styles.meta}>{report.bdm?.employeeDetails?.employeeId || 'No Employee ID'}</Text>
          <Text style={styles.dateText}>{dateLabel(report.dateKey)}</Text>
          {report.submittedAt ? (
            <View style={styles.submittedRow}>
              <Send size={iconSizes.card} color={colors.success} />
              <Text style={styles.submittedText}>Submitted at {timeLabel(report.submittedAt)}</Text>
            </View>
          ) : (
            <Text style={styles.notSubmittedText}>Not yet submitted</Text>
          )}
        </Card>

        {rows.map((dcr) => (
          <CallCard key={dcr._id} dcr={dcr} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function CallCard({ dcr }) {
  const isActivity = dcr.type === 'camp';
  const Icon = isActivity ? Tent : Stethoscope;
  const duration = durationLabel(dcr.startTime, dcr.endTime);

  return (
    <Card style={styles.callCard}>
      <View style={styles.callTop}>
        <Icon size={iconSizes.header} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.callTitle}>{isActivity ? dcr.activityName : (dcr.doctorId?.name || 'Unknown doctor')}</Text>
          <Text style={styles.meta}>{dcr.type.charAt(0).toUpperCase() + dcr.type.slice(1)} call</Text>
        </View>
        <StatusBadge label={dcr.status} tone={TONE_BY_STATUS[dcr.status]} />
      </View>

      <View style={styles.metaRow}>
        <MapPin size={iconSizes.card} color={colors.muted} />
        <Text style={styles.meta}>{(isActivity ? dcr.venue : dcr.doctorId?.area) || 'No area on file'}</Text>
      </View>

      {!isActivity && dcr.productsDetailed?.length > 0 && (
        <View style={styles.metaRow}>
          <Pill size={iconSizes.card} color={colors.muted} />
          <Text style={styles.meta}>{dcr.productsDetailed.join(', ')}</Text>
        </View>
      )}

      {!isActivity && dcr.samplesGiven?.length > 0 && (
        <View style={styles.metaRow}>
          <Package size={iconSizes.card} color={colors.muted} />
          <Text style={styles.meta}>{dcr.samplesGiven.map((s) => `${s.product} · ${s.quantity}`).join(', ')}</Text>
        </View>
      )}

      {dcr.feedback ? (
        <View style={styles.metaRow}>
          <MessageSquare size={iconSizes.card} color={colors.muted} />
          <Text style={styles.meta}>{dcr.feedback}</Text>
        </View>
      ) : null}

      {(dcr.startTime || dcr.endTime) && (
        <View style={styles.metaRow}>
          <Clock size={iconSizes.card} color={colors.muted} />
          <Text style={styles.meta}>
            {dcr.startTime ? timeLabel(dcr.startTime) : '—'} – {dcr.endTime ? timeLabel(dcr.endTime) : '—'}
            {duration ? ` (${duration})` : ''}
          </Text>
        </View>
      )}
    </Card>
  );
}

function durationLabel(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const minutes = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins ? ` ${mins}m` : ''}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  headerCard: { gap: 2 },
  bdmName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  dateText: { fontSize: 13, color: colors.ink, fontWeight: '600', marginTop: 4 },
  submittedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  submittedText: { fontSize: 12, color: colors.success, fontWeight: '600' },
  notSubmittedText: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: 6 },
  callCard: { gap: spacing.xs },
  callTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  callTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 }
});
