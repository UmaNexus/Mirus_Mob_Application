import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Save, Send, Undo2, Pencil, Trash2 } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import * as mtpApi from '../../api/mtp';
import * as doctorsApi from '../../api/doctors';
import * as holidaysApi from '../../api/holidays';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import StatusBadge from '../../components/StatusBadge';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';
import {
  monthKey, daysInMonth, firstWeekdayMonFirst, monthLabel, shortDate, rangeLabel,
  datesBetween, blocksFromVisits, flattenBlocks, isWeekend
} from '../../utils/mtpBlocks';

const EDITABLE_STATUSES = ['draft', 'rejected', 'withdrawn'];
const TONE_BY_STATUS = { draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral' };

const BLOCK_PALETTE = [
  { soft: colors.successSoft, solid: colors.success },
  { soft: colors.infoSoft, solid: colors.info },
  { soft: colors.warningSoft, solid: colors.warning },
  { soft: colors.dangerSoft, solid: colors.danger }
];

// HRMS holidays are shown in red everywhere — reusing the shared danger
// tokens rather than a separate holiday color.
const HOLIDAY_COLOR = colors.danger;
const HOLIDAY_SOFT = colors.dangerSoft;

/**
 * One tour submission — a fresh draft ("+ Create New Tour", no route param)
 * or an existing tour opened from the month view (`route.params.plan`). A
 * BDM may hold several of these per month; this screen only ever
 * creates/edits the ONE tour it was opened for — it never looks up or
 * touches "the month's plan" the way the old one-plan-per-month screen did.
 *
 * MTP answers "where will the BDM work, and when" — a date range plus an
 * Area/Location, nothing more. There is deliberately no doctor selection
 * here: which doctors get visited is decided later, day-by-day, through
 * Today's Work Type/DCR. Authorized areas are read from the BDM's own
 * assigned doctors (the existing Doctor.area/territory data) — there is no
 * separate Area model to introduce.
 */
export default function TourDetailScreen({ route, navigation }) {
  const initialPlan = route.params?.plan || null;
  const month = initialPlan?.month || route.params.month;

  const [plan, setPlan] = useState(initialPlan);
  const [activePlanId, setActivePlanId] = useState(initialPlan?._id || null);
  const editable = !plan || EDITABLE_STATUSES.includes(plan.status);

  const doctorsQuery = useAsync(() => doctorsApi.listMine(), []);
  const areas = useMemo(() => [...new Set((doctorsQuery.data || []).map((d) => d.area).filter(Boolean))].sort(), [doctorsQuery.data]);

  const year = Number(month.split('-')[0]);
  const holidaysQuery = useAsync(() => holidaysApi.listHolidays(year), [year]);
  const holidayDates = useMemo(
    () => new Set((holidaysQuery.data || []).filter((h) => h.dateKey.startsWith(month)).map((h) => h.dateKey)),
    [holidaysQuery.data, month]
  );

  const approversQuery = useAsync(() => mtpApi.listApprovers(), []);
  const approverOptions = useMemo(() => (approversQuery.data || []).map((a) => ({
    label: `${a.personalDetails?.firstName || ''} ${a.personalDetails?.lastName || ''}`.trim() || 'Unnamed',
    value: a._id,
    sublabel: [a.employeeDetails?.fieldForce?.tier || (a.role === 'admin' || a.role === 'superadmin' ? 'Admin' : null), a.employeeDetails?.fieldForce?.territory].filter(Boolean).join(' · ')
  })), [approversQuery.data]);
  const [approverId, setApproverId] = useState(null);

  const [blocks, setBlocks] = useState(() => (
    initialPlan ? blocksFromVisits(initialPlan.plannedVisits || []) : []
  ));
  const [remarks, setRemarks] = useState(initialPlan?.remarks || '');

  // ---- In-progress range selection ----
  const [pendingStart, setPendingStart] = useState(null);
  const [pendingEnd, setPendingEnd] = useState(null);
  const [pendingArea, setPendingArea] = useState(null);
  const [blockError, setBlockError] = useState(null);
  const hasPendingRange = Boolean(pendingStart && pendingEnd);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const plannedVisits = useMemo(() => flattenBlocks(blocks), [blocks]);

  const summary = useMemo(() => {
    const dateSet = new Set();
    const areaSet = new Set();
    blocks.forEach((b) => {
      datesBetween(b.startDate, b.endDate).forEach((d) => dateSet.add(d));
      areaSet.add(b.area);
    });
    return { rangeCount: blocks.length, tourDays: dateSet.size, areaCount: areaSet.size };
  }, [blocks]);

  const resetPending = () => { setPendingStart(null); setPendingEnd(null); setPendingArea(null); setBlockError(null); };

  const handleDayPress = (dateKey) => {
    if (!editable) return;
    setBlockError(null);
    // Weekends are never a valid tour start or end date — existing weekday
    // range behavior below is otherwise unchanged.
    if (isWeekend(dateKey)) {
      setBlockError('Saturday and Sunday cannot be selected as a tour start or end date.');
      return;
    }
    if (!pendingStart || hasPendingRange) {
      setPendingStart(dateKey); setPendingEnd(null); setPendingArea(null);
      return;
    }
    if (dateKey < pendingStart) { setPendingEnd(pendingStart); setPendingStart(dateKey); } else { setPendingEnd(dateKey); }
  };

  const handleAddRange = () => {
    setBlockError(null);
    if (!pendingStart || !pendingEnd || !pendingArea) return;

    const newDates = datesBetween(pendingStart, pendingEnd);

    // Both endpoints are already guaranteed non-weekend (handleDayPress), but
    // a range spanning e.g. Friday to Monday still passes through a
    // Saturday/Sunday in between — reject the whole range with a clear
    // message rather than silently dropping those dates from it.
    const weekendDates = newDates.filter(isWeekend);
    if (weekendDates.length > 0) {
      setBlockError(
        `This range includes ${weekendDates.length} weekend date${weekendDates.length === 1 ? '' : 's'} (${weekendDates.map(shortDate).join(', ')}). Tour ranges cannot include Saturday or Sunday.`
      );
      return;
    }

    const existingDates = new Set();
    blocks.forEach((b) => datesBetween(b.startDate, b.endDate).forEach((d) => existingDates.add(d)));

    for (const date of newDates) {
      if (existingDates.has(date)) {
        setBlockError(`${shortDate(date)} is already assigned to another date range in this tour. Date ranges cannot overlap.`);
        return;
      }
    }

    setBlocks((prev) => [...prev, {
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      startDate: pendingStart, endDate: pendingEnd, area: pendingArea
    }]);
    resetPending();
  };

  const handleEditBlock = (block) => {
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    setPendingStart(block.startDate); setPendingEnd(block.endDate); setPendingArea(block.area);
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

  const handleSubmit = () => {
    if (!approverId) {
      setError('Please select an approver before submitting the MTP.');
      return;
    }
    runAction(() => mtpApi.submit(activePlanId, approverId, remarks), 'Submitted for approval.');
  };
  const handleWithdraw = () => runAction(() => mtpApi.withdraw(activePlanId), 'Withdrawn.');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={typography.title}>{monthLabel(month)}</Text>
          <StatusBadge label={plan ? plan.status : 'New tour'} tone={plan ? TONE_BY_STATUS[plan.status] : 'neutral'} />
        </View>

        {doctorsQuery.status === 'error' && <ErrorBanner message={doctorsQuery.error} />}

        <CalendarGrid month={month} blocks={blocks} pendingStart={pendingStart} pendingEnd={pendingEnd} holidayDates={holidayDates} onDayPress={editable ? handleDayPress : undefined} />

        {plan?.submittedAt && <Text style={styles.meta}>Submitted {new Date(plan.submittedAt).toLocaleString()}</Text>}
        {plan?.approverId && (
          <Text style={styles.meta}>
            Approver: {`${plan.approverId.personalDetails?.firstName || ''} ${plan.approverId.personalDetails?.lastName || ''}`.trim() || 'Unnamed'}
            {plan.approverId.employeeDetails?.fieldForce?.tier ? ` · ${plan.approverId.employeeDetails.fieldForce.tier}` : ''}
          </Text>
        )}
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
                  onChange={setPendingArea}
                  options={areas.map((a) => ({ label: a, value: a }))}
                  placeholder={areas.length ? 'Select an area' : 'No areas assigned yet'}
                />

                <ErrorBanner message={blockError} />
                <Button icon={Plus} title="Add to Tour Plan" onPress={handleAddRange} disabled={!pendingArea} />
              </>
            )}
          </Card>
        )}

        <Card>
          <Text style={typography.label}>Tour ranges ({blocks.length})</Text>
          {blocks.length === 0 && <Text style={styles.hint}>No date ranges added yet.</Text>}
          {blocks.map((b, idx) => {
            const palette = BLOCK_PALETTE[idx % BLOCK_PALETTE.length];
            const dayCount = datesBetween(b.startDate, b.endDate).length;
            return (
              <View key={b.id} style={[styles.blockRow, { borderLeftColor: palette.solid }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockRange}>{rangeLabel(b.startDate, b.endDate)}</Text>
                  <Text style={styles.blockArea}>{b.area}</Text>
                  <Text style={styles.blockMeta}>{dayCount} tour day{dayCount === 1 ? '' : 's'}</Text>
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
          </View>
        </Card>

        {editable && <FormField label="Remarks for your manager (optional)" value={remarks} onChangeText={setRemarks} placeholder="Add a note…" multiline numberOfLines={3} />}

        {editable && activePlanId && (
          <Card style={styles.planCard}>
            <Text style={typography.label}>Submit for approval</Text>
            <SelectField
              label="Select Approver"
              value={approverId}
              onChange={setApproverId}
              options={approverOptions}
              placeholder={approverOptions.length ? 'Select an approver' : 'No eligible approver found'}
            />
            {approversQuery.status === 'error' && <ErrorBanner message={approversQuery.error} />}
          </Card>
        )}

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

function CalendarGrid({ month, blocks, pendingStart, pendingEnd, holidayDates, onDayPress }) {
  const [year, m] = month.split('-').map(Number);
  const total = daysInMonth(year, m);
  const leading = firstWeekdayMonFirst(year, m);
  const cells = [...Array(leading).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  return (
    <Card>
      <View style={styles.weekHeader}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, idx) => (
          <Text key={d} style={[styles.weekHeaderText, idx >= 5 && styles.weekendHeaderText]}>{d}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`blank-${idx}`} style={styles.cell} />;
          const dateKey = `${month}-${String(day).padStart(2, '0')}`;
          const treatment = dayTreatment(dateKey, blocks, pendingStart, pendingEnd);
          const isEdge = treatment && (treatment.edge === 'start' || treatment.edge === 'end' || treatment.edge === 'both');
          const weekend = isWeekend(dateKey);
          const holiday = holidayDates?.has(dateKey);
          // Weekends can never be a tour start/end/mid-range date — disabled
          // here in addition to the handler-level guard in handleDayPress.
          // Holidays stay tappable (MTP never disabled holidays before this
          // change), just shown in red like every other calendar.
          return (
            <Pressable
              key={dateKey}
              onPress={() => onDayPress?.(dateKey)}
              disabled={!onDayPress || weekend}
              style={[
                styles.cell, styles.dayCell,
                treatment && { backgroundColor: treatment.soft },
                isEdge && { backgroundColor: treatment.solid },
                weekend && !treatment && styles.weekendCell,
                holiday && styles.holidayCell
              ]}
            >
              <Text style={[styles.dayText, isEdge && styles.dayTextOnSolid, weekend && !isEdge && styles.weekendText, holiday && !isEdge && styles.holidayText]}>{day}</Text>
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
  weekendHeaderText: { color: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  cell: { width: '13%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: 1 },
  dayCell: {},
  dayText: { fontSize: 13, color: colors.ink },
  dayTextOnSolid: { color: colors.white, fontWeight: '700' },
  weekendCell: { backgroundColor: colors.surface, opacity: 0.55 },
  weekendText: { color: colors.muted },
  holidayCell: { backgroundColor: HOLIDAY_SOFT, borderWidth: 1, borderColor: HOLIDAY_COLOR, opacity: 1 },
  holidayText: { color: HOLIDAY_COLOR, fontWeight: '700' },
  areaTag: { fontSize: 7, color: colors.ink, marginTop: 1 },
  areaTagOnSolid: { color: colors.white },

  planCard: { gap: spacing.sm },
  cancelLink: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  selectedDatesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rangeText: { fontSize: 16, fontWeight: '700', color: colors.primary },

  blockRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderLeftWidth: 4, paddingLeft: spacing.sm, marginTop: spacing.xs },
  blockRange: { fontSize: 14, fontWeight: '700', color: colors.ink },
  blockArea: { fontSize: 12, color: colors.muted, marginTop: 1 },
  blockMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  blockActions: { gap: spacing.xs, alignItems: 'flex-end' },
  blockActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockActionText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  blockActionDanger: { color: colors.danger },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  summaryStat: { width: '33%', alignItems: 'center', paddingVertical: spacing.sm },
  summaryValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  summaryLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },

  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 }
});
