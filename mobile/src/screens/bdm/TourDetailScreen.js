import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Plus, Save, Send, Undo2, Pencil, Trash2 } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import * as mtpApi from '../../api/mtp';
import * as doctorsApi from '../../api/doctors';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';
import {
  monthKey, daysInMonth, firstWeekdayMonFirst, monthLabel, shortDate, rangeLabel,
  datesBetween, blocksFromVisits, areaLookupFromPopulatedVisits, flattenBlocks
} from '../../utils/mtpBlocks';

const EDITABLE_STATUSES = ['draft', 'rejected', 'withdrawn'];
const TONE_BY_STATUS = { draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };

const BLOCK_PALETTE = [
  { soft: colors.successSoft, solid: colors.success },
  { soft: colors.infoSoft, solid: colors.info },
  { soft: colors.warningSoft, solid: colors.warning },
  { soft: colors.dangerSoft, solid: colors.danger }
];

/**
 * One tour submission — a fresh draft ("+ Create New Tour", no route param)
 * or an existing tour opened from the month view (`route.params.plan`). A
 * BDM may hold several of these per month; this screen only ever
 * creates/edits the ONE tour it was opened for — it never looks up or
 * touches "the month's plan" the way the old one-plan-per-month screen did.
 * Range building (tap start date, tap end date, area, doctors, Add to Tour
 * Plan) is unchanged from the single-tour version of this screen.
 */
export default function TourDetailScreen({ route, navigation }) {
  const initialPlan = route.params?.plan || null;
  const month = initialPlan?.month || route.params.month;

  const [plan, setPlan] = useState(initialPlan);
  const [activePlanId, setActivePlanId] = useState(initialPlan?._id || null);
  const editable = !plan || EDITABLE_STATUSES.includes(plan.status);

  const doctorsQuery = useAsync(() => doctorsApi.listMine({ month }), [month]);
  const doctors = doctorsQuery.data || [];
  const doctorMap = useMemo(() => new Map(doctors.map((d) => [String(d._id), d])), [doctors]);
  const areas = useMemo(() => [...new Set(doctors.map((d) => d.area).filter(Boolean))].sort(), [doctors]);

  const [blocks, setBlocks] = useState(() => (
    initialPlan ? blocksFromVisits(initialPlan.plannedVisits || [], areaLookupFromPopulatedVisits(initialPlan.plannedVisits || [])) : []
  ));
  const [remarks, setRemarks] = useState(initialPlan?.remarks || '');

  // ---- In-progress range selection ----
  const [pendingStart, setPendingStart] = useState(null);
  const [pendingEnd, setPendingEnd] = useState(null);
  const [pendingArea, setPendingArea] = useState(null);
  const [pendingDoctorIds, setPendingDoctorIds] = useState(() => new Set());
  const [blockError, setBlockError] = useState(null);
  const hasPendingRange = Boolean(pendingStart && pendingEnd);
  const pendingAreaDoctors = useMemo(() => (pendingArea ? doctors.filter((d) => d.area === pendingArea) : []), [doctors, pendingArea]);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const plannedVisits = useMemo(() => flattenBlocks(blocks), [blocks]);

  const summary = useMemo(() => {
    const dateSet = new Set();
    const doctorIds = new Set();
    const areaSet = new Set();
    blocks.forEach((b) => {
      datesBetween(b.startDate, b.endDate).forEach((d) => dateSet.add(d));
      b.doctorIds.forEach((id) => doctorIds.add(id));
      areaSet.add(b.area);
    });
    return { rangeCount: blocks.length, tourDays: dateSet.size, areaCount: areaSet.size, doctorCount: doctorIds.size, totalVisits: plannedVisits.length };
  }, [blocks, plannedVisits]);

  const resetPending = () => { setPendingStart(null); setPendingEnd(null); setPendingArea(null); setPendingDoctorIds(new Set()); setBlockError(null); };

  const handleDayPress = (dateKey) => {
    if (!editable) return;
    setBlockError(null);
    if (!pendingStart || hasPendingRange) {
      setPendingStart(dateKey); setPendingEnd(null); setPendingArea(null); setPendingDoctorIds(new Set());
      return;
    }
    if (dateKey < pendingStart) { setPendingEnd(pendingStart); setPendingStart(dateKey); } else { setPendingEnd(dateKey); }
  };

  const toggleDoctor = (id) => {
    setPendingDoctorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddRange = () => {
    setBlockError(null);
    if (!pendingStart || !pendingEnd || !pendingArea || pendingDoctorIds.size === 0) return;

    const newDates = datesBetween(pendingStart, pendingEnd);
    const existingPairs = new Set();
    blocks.forEach((b) => datesBetween(b.startDate, b.endDate).forEach((d) => b.doctorIds.forEach((id) => existingPairs.add(`${id}_${d}`))));

    for (const date of newDates) {
      for (const doctorId of pendingDoctorIds) {
        if (existingPairs.has(`${doctorId}_${date}`)) {
          setBlockError(`${doctorMap.get(doctorId)?.name || 'This doctor'} is already planned on ${shortDate(date)} in another range in this tour.`);
          return;
        }
      }
    }

    setBlocks((prev) => [...prev, {
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      startDate: pendingStart, endDate: pendingEnd, area: pendingArea, doctorIds: [...pendingDoctorIds]
    }]);
    resetPending();
  };

  const handleEditBlock = (block) => {
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    setPendingStart(block.startDate); setPendingEnd(block.endDate); setPendingArea(block.area); setPendingDoctorIds(new Set(block.doctorIds));
    setBlockError(null);
  };

  const handleRemoveBlock = (id) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const handleSaveDraft = async () => {
    setError(null); setSuccess(null); setSaving(true);
    try {
      const saved = activePlanId
        ? await mtpApi.update(activePlanId, { plannedVisits, remarks })
        : await mtpApi.create({ month, plannedVisits, remarks });
      setPlan(saved);
      setActivePlanId(saved._id);
      await doctorsQuery.reload();
      setSuccess('Draft saved.');
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (fn, message) => {
    setError(null); setSuccess(null); setBusy(true);
    try {
      const updated = await fn();
      setPlan(updated);
      if (message) setSuccess(message);
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = () => runAction(() => mtpApi.submit(activePlanId, remarks), 'Submitted for approval.');
  const handleWithdraw = () => runAction(() => mtpApi.withdraw(activePlanId), 'Withdrawn.');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={typography.title}>{monthLabel(month)}</Text>
          <StatusBadge label={plan ? plan.status : 'New tour'} tone={plan ? TONE_BY_STATUS[plan.status] : 'neutral'} />
        </View>

        {doctorsQuery.status === 'error' && <ErrorBanner message={doctorsQuery.error} />}

        <CalendarGrid month={month} blocks={blocks} pendingStart={pendingStart} pendingEnd={pendingEnd} onDayPress={editable ? handleDayPress : undefined} />

        {plan?.submittedAt && <Text style={styles.meta}>Submitted {new Date(plan.submittedAt).toLocaleString()}</Text>}
        {plan?.decidedAt && <Text style={styles.meta}>Decided {new Date(plan.decidedAt).toLocaleString()}{plan.decisionNote ? ` — ${plan.decisionNote}` : ''}</Text>}

        {editable && (
          <Card style={styles.planCard}>
            {!pendingStart && <Text style={styles.hint}>Tap a start date, then an end date, to build a tour date range.</Text>}
            {pendingStart && !pendingEnd && (
              <>
                <Text style={typography.label}>Start: {shortDate(pendingStart)}</Text>
                <Text style={styles.hint}>Now tap an end date on the calendar above.</Text>
                <Pressable onPress={resetPending}><Text style={styles.cancelLink}>Cancel selection</Text></Pressable>
              </>
            )}
            {hasPendingRange && (
              <>
                <View style={styles.selectedDatesRow}>
                  <Text style={typography.label}>Selected dates</Text>
                  <Pressable onPress={resetPending}><Text style={styles.cancelLink}>Cancel</Text></Pressable>
                </View>
                <Text style={styles.rangeText}>{rangeLabel(pendingStart, pendingEnd)}</Text>

                <SelectField
                  label="Select Area"
                  value={pendingArea}
                  onChange={(v) => { setPendingArea(v); setPendingDoctorIds(new Set()); }}
                  options={areas.map((a) => ({ label: a, value: a }))}
                  placeholder={areas.length ? 'Select an area' : 'No areas assigned yet'}
                />

                {pendingArea && (
                  <View style={styles.doctorList}>
                    <Text style={typography.label}>Doctors in {pendingArea}</Text>
                    {pendingAreaDoctors.length === 0 && <Text style={styles.hint}>No doctors assigned in this area.</Text>}
                    {pendingAreaDoctors.map((d) => (
                      <Pressable key={d._id} onPress={() => toggleDoctor(d._id)} style={styles.doctorRow}>
                        <View style={[styles.checkbox, pendingDoctorIds.has(d._id) && styles.checkboxChecked]}>
                          {pendingDoctorIds.has(d._id) ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.doctorName}>{d.name}</Text>
                          <Text style={styles.doctorMeta}>
                            {d.speciality || 'General'}
                            {d.lastVisitAt ? ` · Last visit ${new Date(d.lastVisitAt).toLocaleDateString()}` : ' · No visits yet'}
                            {d.plannedVisitsThisMonth ? ` · ${d.plannedVisitsThisMonth} planned this month` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                    {pendingDoctorIds.size > 0 && (
                      <Text style={styles.applyHint}>
                        {[...pendingDoctorIds].map((id) => doctorMap.get(id)?.name).filter(Boolean).join(', ')} will be planned on every date from {rangeLabel(pendingStart, pendingEnd)}.
                      </Text>
                    )}
                  </View>
                )}

                <ErrorBanner message={blockError} />
                <Button icon={Plus} title="Add to Tour Plan" onPress={handleAddRange} disabled={!pendingArea || pendingDoctorIds.size === 0} />
              </>
            )}
          </Card>
        )}

        <Card>
          <Text style={typography.label}>Tour ranges ({blocks.length})</Text>
          {blocks.length === 0 && <Text style={styles.hint}>No date ranges added yet.</Text>}
          {blocks.map((b, idx) => {
            const palette = BLOCK_PALETTE[idx % BLOCK_PALETTE.length];
            return (
              <View key={b.id} style={[styles.blockRow, { borderLeftColor: palette.solid }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockRange}>{rangeLabel(b.startDate, b.endDate)}</Text>
                  <Text style={styles.blockArea}>{b.area} · {b.doctorIds.length} doctor{b.doctorIds.length === 1 ? '' : 's'}</Text>
                  <Text style={styles.blockDoctors}>{b.doctorIds.map((id) => doctorMap.get(id)?.name || 'Doctor').join(', ')}</Text>
                </View>
                {editable && (
                  <View style={styles.blockActions}>
                    <Pressable onPress={() => handleEditBlock(b)} style={styles.blockActionBtn} accessibilityLabel="Edit range" accessibilityRole="button">
                      <Pencil size={iconSizes.action} color={colors.primary} />
                      <Text style={styles.blockActionText}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => handleRemoveBlock(b.id)} style={styles.blockActionBtn} accessibilityLabel="Remove range" accessibilityRole="button">
                      <Trash2 size={iconSizes.action} color={colors.danger} />
                      <Text style={[styles.blockActionText, styles.blockActionDanger]}>Remove</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </Card>

        <Card>
          <Text style={typography.label}>Tour summary</Text>
          <View style={styles.summaryGrid}>
            <SummaryStat value={summary.rangeCount} label="Date ranges" />
            <SummaryStat value={summary.tourDays} label="Tour days" />
            <SummaryStat value={summary.areaCount} label="Areas" />
            <SummaryStat value={summary.doctorCount} label="Doctors" />
          </View>
          <Text style={styles.totalVisitsLine}>{summary.totalVisits} planned doctor visit{summary.totalVisits === 1 ? '' : 's'} total</Text>
        </Card>

        {editable && <FormField label="Remarks for your manager (optional)" value={remarks} onChangeText={setRemarks} placeholder="Add a note…" multiline numberOfLines={3} />}

        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        {editable && (
          <View style={styles.actionsRow}>
            <Button icon={Save} title="Save Draft" variant="outline" onPress={handleSaveDraft} loading={saving} style={styles.actionBtn} />
            {activePlanId && <Button icon={Send} title="Submit" onPress={handleSubmit} loading={busy} style={styles.actionBtn} />}
          </View>
        )}
        {plan?.status === 'pending' && <Button icon={Undo2} title="Withdraw" variant="danger" onPress={handleWithdraw} loading={busy} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function dayTreatment(dateKey, blocks, pendingStart, pendingEnd) {
  if (pendingStart && !pendingEnd && dateKey === pendingStart) {
    return { kind: 'pending', edge: 'both', soft: colors.primarySoft, solid: colors.primary };
  }
  if (pendingStart && pendingEnd) {
    const [lo, hi] = pendingStart <= pendingEnd ? [pendingStart, pendingEnd] : [pendingEnd, pendingStart];
    if (dateKey >= lo && dateKey <= hi) {
      const edge = dateKey === lo && dateKey === hi ? 'both' : dateKey === lo ? 'start' : dateKey === hi ? 'end' : 'mid';
      return { kind: 'pending', edge, soft: colors.primarySoft, solid: colors.primary };
    }
  }
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (dateKey >= b.startDate && dateKey <= b.endDate) {
      const edge = b.startDate === b.endDate ? 'both' : dateKey === b.startDate ? 'start' : dateKey === b.endDate ? 'end' : 'mid';
      const palette = BLOCK_PALETTE[i % BLOCK_PALETTE.length];
      return { kind: 'block', edge, soft: palette.soft, solid: palette.solid, area: b.area };
    }
  }
  return null;
}

function CalendarGrid({ month, blocks, pendingStart, pendingEnd, onDayPress }) {
  const [year, m] = month.split('-').map(Number);
  const total = daysInMonth(year, m);
  const leading = firstWeekdayMonFirst(year, m);
  const cells = [...Array(leading).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  return (
    <Card>
      <View style={styles.weekHeader}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <Text key={d} style={styles.weekHeaderText}>{d}</Text>)}
      </View>
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`blank-${idx}`} style={styles.cell} />;
          const dateKey = `${month}-${String(day).padStart(2, '0')}`;
          const treatment = dayTreatment(dateKey, blocks, pendingStart, pendingEnd);
          const isEdge = treatment && (treatment.edge === 'start' || treatment.edge === 'end' || treatment.edge === 'both');
          return (
            <Pressable
              key={dateKey}
              onPress={() => onDayPress?.(dateKey)}
              disabled={!onDayPress}
              style={[styles.cell, styles.dayCell, treatment && { backgroundColor: treatment.soft }, isEdge && { backgroundColor: treatment.solid }]}
            >
              <Text style={[styles.dayText, isEdge && styles.dayTextOnSolid]}>{day}</Text>
              {treatment?.kind === 'block' && treatment.edge !== 'mid' && treatment.edge !== 'end' && (
                <Text style={[styles.areaTag, isEdge && styles.areaTagOnSolid]} numberOfLines={1}>{treatment.area}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function SummaryStat({ value, label }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontSize: 12, color: colors.muted },
  hint: { fontSize: 12, color: colors.muted, marginTop: 2, marginBottom: spacing.xs },

  weekHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginBottom: spacing.xs },
  weekHeaderText: { width: '13%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  cell: { width: '13%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: 1 },
  dayCell: {},
  dayText: { fontSize: 13, color: colors.ink },
  dayTextOnSolid: { color: colors.white, fontWeight: '700' },
  areaTag: { fontSize: 7, color: colors.ink, marginTop: 1 },
  areaTagOnSolid: { color: colors.white },

  planCard: { gap: spacing.sm },
  cancelLink: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  selectedDatesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rangeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  applyHint: { fontSize: 11, color: colors.muted, fontStyle: 'italic', marginTop: spacing.xs },

  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },

  doctorList: { gap: spacing.xs },
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  doctorName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  doctorMeta: { fontSize: 11, color: colors.muted, marginTop: 1 },

  blockRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderLeftWidth: 4, paddingLeft: spacing.sm, marginTop: spacing.xs },
  blockRange: { fontSize: 14, fontWeight: '700', color: colors.ink },
  blockArea: { fontSize: 12, color: colors.muted, marginTop: 1 },
  blockDoctors: { fontSize: 11, color: colors.muted, marginTop: 2 },
  blockActions: { gap: spacing.xs, alignItems: 'flex-end' },
  blockActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockActionText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  blockActionDanger: { color: colors.danger },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  summaryStat: { width: '50%', alignItems: 'center', paddingVertical: spacing.sm },
  summaryValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  totalVisitsLine: { fontSize: 12, color: colors.ink, fontWeight: '600', textAlign: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.xs },

  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 }
});
