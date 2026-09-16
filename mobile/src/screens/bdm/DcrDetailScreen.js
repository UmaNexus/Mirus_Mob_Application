import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stethoscope, MapPin, Pill, Package, MessageSquare, Clock, Hourglass, RefreshCw, Save, CircleCheck, CircleX, Plus, Trash2, Tent } from 'lucide-react-native';
import * as dcrApi from '../../api/dcr';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import TimeField from '../../components/TimeField';
import StatusBadge from '../../components/StatusBadge';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import { colors, spacing, typography, iconSizes } from '../../theme';

const TONE_BY_STATUS = { pending: 'warning', completed: 'success', missed: 'danger' };

/**
 * Completes (or reviews) one already-logged call — the doctor and call type
 * are fixed at creation and shown read-only; everything else (product
 * detail, samples, feedback, start/end time, status) is editable here via
 * PATCH /api/dcr/:id until the day is submitted. This is the same record a
 * quick "Confirm & Log Call" from Today's Work Type created — there is no
 * separate completion record.
 *
 * Start/End Time replace the old single Visit Time: both are manually
 * picked, optional (never required — a missed call has no duration), and
 * validated (End Time must be after Start Time) on both this screen and the
 * server. An old record that only ever had `visitTime` still works — it is
 * treated as the start time, with no end time until one is explicitly set.
 */
export default function DcrDetailScreen({ route, navigation }) {
  const initial = route.params.dcr;
  const [dcr, setDcr] = useState(initial);
  const [productsText, setProductsText] = useState((initial.productsDetailed || []).join(', '));
  const [samples, setSamples] = useState(initial.samplesGiven || []);
  const [sampleProduct, setSampleProduct] = useState('');
  const [sampleQty, setSampleQty] = useState('');
  const [feedback, setFeedback] = useState(initial.feedback || '');
  // Backward compatible: an old record has only `visitTime` — treat it as
  // the start time so it still displays/edits sensibly; `endTime` stays
  // unset until the BDM picks one (never invented).
  const [startTime, setStartTime] = useState(initial.startTime || initial.visitTime);
  const [endTime, setEndTime] = useState(initial.endTime || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const editable = !dcr.submittedAt;
  const isMissedType = dcr.type === 'missed';
  const isActivity = dcr.type === 'camp';
  const ActivityIcon = Tent;

  const durationMinutes = useMemo(() => {
    if (!startTime || !endTime) return null;
    const diffMs = new Date(endTime) - new Date(startTime);
    return diffMs > 0 ? Math.round(diffMs / 60000) : null;
  }, [startTime, endTime]);

  const durationLabel = useMemo(() => {
    if (durationMinutes == null) return null;
    if (durationMinutes < 60) return `${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}`;
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    return `${hours} hour${hours === 1 ? '' : 's'}${mins ? ` ${mins} minute${mins === 1 ? '' : 's'}` : ''}`;
  }, [durationMinutes]);

  const buildPayload = () => ({
    productsDetailed: productsText.split(',').map((s) => s.trim()).filter(Boolean),
    samplesGiven: samples,
    feedback,
    startTime,
    endTime
  });

  const save = async (extra = {}) => {
    setError(null); setSuccess(null);
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      setError('End Time must be after Start Time.');
      return;
    }
    setBusy(true);
    try {
      const updated = await dcrApi.update(dcr._id, { ...buildPayload(), ...extra });
      setDcr(updated);
      setSuccess(extra.status ? `Marked ${extra.status}.` : 'Saved.');
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  const addSample = () => {
    if (!sampleProduct.trim()) return;
    setSamples((prev) => [...prev, { product: sampleProduct.trim(), quantity: Number(sampleQty) || 1 }]);
    setSampleProduct(''); setSampleQty('');
  };
  const removeSample = (idx) => setSamples((prev) => prev.filter((_, i) => i !== idx));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {isActivity ? (
          <Card style={styles.doctorCard}>
            <View style={styles.doctorRow}>
              <ActivityIcon size={iconSizes.header} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.doctorName}>{dcr.activityName}</Text>
                <Text style={styles.doctorMeta}>Special camp</Text>
              </View>
              <StatusBadge label={dcr.status} tone={TONE_BY_STATUS[dcr.status]} />
            </View>
            {dcr.venue ? (
              <View style={styles.areaRow}>
                <MapPin size={iconSizes.card} color={colors.muted} />
                <Text style={styles.doctorMeta}>{dcr.venue}</Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card style={styles.doctorCard}>
            <View style={styles.doctorRow}>
              <Stethoscope size={iconSizes.header} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.doctorName}>{dcr.doctorId?.name}</Text>
                <Text style={styles.doctorMeta}>{dcr.doctorId?.speciality || 'General'}</Text>
              </View>
              <StatusBadge label={dcr.status} tone={TONE_BY_STATUS[dcr.status]} />
            </View>
            <View style={styles.areaRow}>
              <MapPin size={iconSizes.card} color={colors.muted} />
              <Text style={styles.doctorMeta}>{dcr.doctorId?.area || 'No area on file'}</Text>
            </View>
          </Card>
        )}

        {!editable && <Text style={styles.hint}>This day's DCR has already been submitted and can no longer be edited.</Text>}

        {!isActivity && (
          <Card style={styles.gap}>
            <FieldLabel icon={Pill} text="Product Details" />
            <FormField value={productsText} onChangeText={setProductsText} placeholder="e.g. Neurogain, Cardivax" editable={editable} />
          </Card>
        )}

        {!isMissedType && !isActivity && (
          <Card style={styles.gap}>
            <FieldLabel icon={Package} text="Samples Given" />
            {samples.map((s, idx) => (
              <View key={`${s.product}-${idx}`} style={styles.sampleRow}>
                <Text style={styles.sampleText}>{s.product} · {s.quantity}</Text>
                {editable && (
                  <Pressable onPress={() => removeSample(idx)} accessibilityLabel={`Remove ${s.product} sample`} accessibilityRole="button">
                    <Trash2 size={iconSizes.action} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            ))}
            {editable && (
              <View style={styles.addSampleRow}>
                <FormField value={sampleProduct} onChangeText={setSampleProduct} placeholder="Product" style={styles.sampleProductInput} />
                <FormField value={sampleQty} onChangeText={setSampleQty} placeholder="Qty" keyboardType="number-pad" style={styles.sampleQtyInput} />
                <Button icon={Plus} title="Add" variant="outline" onPress={addSample} style={styles.addSampleBtn} />
              </View>
            )}
          </Card>
        )}

        <Card style={styles.gap}>
          <FieldLabel icon={MessageSquare} text="Doctor Feedback" />
          <FormField value={feedback} onChangeText={setFeedback} placeholder="Add remarks…" multiline numberOfLines={3} editable={editable} />
        </Card>

        <Card style={styles.gap}>
          <FieldLabel icon={Clock} text="Visit Duration" />
          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <TimeField label="Start Time" value={startTime} onChange={setStartTime} />
              {editable && (
                <Button icon={RefreshCw} title="Now" variant="ghost" onPress={() => setStartTime(new Date().toISOString())} style={styles.nowBtn} />
              )}
            </View>
            <View style={styles.timeCol}>
              <TimeField label="End Time" value={endTime} onChange={setEndTime} />
              {editable && (
                <Button icon={RefreshCw} title="Now" variant="ghost" onPress={() => setEndTime(new Date().toISOString())} style={styles.nowBtn} />
              )}
            </View>
          </View>
          {durationLabel && (
            <View style={styles.durationRow}>
              <Hourglass size={iconSizes.card} color={colors.primary} />
              <Text style={styles.durationText}>{durationLabel}</Text>
            </View>
          )}
        </Card>

        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        {editable && (
          <View style={styles.actions}>
            <Button icon={Save} title="Save" variant="outline" onPress={() => save()} loading={busy} style={styles.actionBtn} />
            {!isMissedType && dcr.status !== 'completed' && (
              <Button icon={CircleCheck} title="Mark Completed" onPress={() => save({ status: 'completed' })} loading={busy} style={styles.actionBtn} />
            )}
          </View>
        )}
        {editable && !isMissedType && dcr.status !== 'missed' && (
          <Button icon={CircleX} title="Mark Missed" variant="danger" onPress={() => save({ status: 'missed' })} loading={busy} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldLabel({ icon: Icon, text }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Icon size={iconSizes.card} color={colors.muted} />
      <Text style={typography.label}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  gap: { gap: spacing.sm },
  hint: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  doctorCard: { gap: spacing.sm },
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  doctorName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  doctorMeta: { fontSize: 12, color: colors.muted },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sampleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line },
  sampleText: { fontSize: 13, color: colors.ink },
  addSampleRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  sampleProductInput: { flex: 2 },
  sampleQtyInput: { flex: 1 },
  addSampleBtn: { marginTop: 2 },
  timeRow: { flexDirection: 'row', gap: spacing.sm },
  timeCol: { flex: 1, gap: 2 },
  nowBtn: { alignSelf: 'flex-start' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  durationText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 }
});
