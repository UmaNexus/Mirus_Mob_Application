import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardList, Users, Tent, Handshake, Thermometer, Palmtree, Send, CircleCheck } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import * as workTypeApi from '../../api/workType';
import * as doctorsApi from '../../api/doctors';
import * as dcrApi from '../../api/dcr';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import DateField from '../../components/DateField';
import StatusBadge from '../../components/StatusBadge';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, radii, spacing, typography } from '../../theme';

const TYPES = [
  { value: 'individual', icon: ClipboardList, label: 'Individual call' },
  { value: 'joint', icon: Users, label: 'Joint call' },
  { value: 'camp', icon: Tent, label: 'Special camp' },
  { value: 'meeting', icon: Handshake, label: 'Meeting' },
  { value: 'sick', icon: Thermometer, label: 'Sick leave' },
  { value: 'leave', icon: Palmtree, label: 'Planned leave' }
];

// The REAL LeaveRequest enum (server/models/LeaveRequest.js) — no invented
// CL/PL/SL values are offered here per the client's explicit decision.
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'].map((t) => ({ label: t, value: t }));

const today = () => new Date().toISOString().slice(0, 10);

/**
 * "What am I doing today" — a quick activity log. For individual/joint/camp/
 * meeting, "Confirm & Log Call" does NOT just record a work-type marker: it
 * creates the actual DCR row via the same POST /api/dcr the DCR screen
 * itself uses, so the activity shows up in today's Daily DCR automatically
 * with nothing further to create there — including on a day whose DCR was
 * already submitted (that is allowed, and is what puts the day into "Needs
 * Resubmission"). The WorkType marker is still set alongside it (existing
 * behavior, best-effort — its failure never blocks the DCR row, which is
 * the record that actually matters).
 */
export default function WorkTypeScreen({ navigation }) {
  const [type, setType] = useState('individual');
  const [date] = useState(today());
  const [doctorId, setDoctorId] = useState(null);
  const [productName, setProductName] = useState('');
  const [accompaniedBy, setAccompaniedBy] = useState(null);
  const [campName, setCampName] = useState('');
  const [venue, setVenue] = useState('');
  const [agenda, setAgenda] = useState('');
  const [leaveType, setLeaveType] = useState('Casual');
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [logged, setLogged] = useState(null); // the DCR call just logged, or null
  const [saved, setSaved] = useState(false); // camp/meeting/sick/leave confirmation

  const doctors = useAsync(doctorsApi.listMine, []);
  const chain = useAsync(dcrApi.myChain, []);
  const doctorOptions = (doctors.data || []).map((d) => ({ label: d.name, value: d._id, sublabel: d.speciality }));
  const managerOptions = (chain.data || []).map((m) => ({
    label: `${m.personalDetails?.firstName || ''} ${m.personalDetails?.lastName || ''}`.trim(),
    value: m._id, sublabel: m.employeeDetails?.fieldForce?.tier
  }));

  const selectedDoctor = useMemo(() => (doctors.data || []).find((d) => d._id === doctorId), [doctors.data, doctorId]);

  const resetCallForm = () => {
    setDoctorId(null); setProductName(''); setAccompaniedBy(null);
    setCampName(''); setAgenda(''); setVenue('');
    setLogged(null);
  };

  const changeType = (v) => { setType(v); setError(null); setSaved(false); setLogged(null); };

  const handleSubmit = async () => {
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      if (type === 'individual' || type === 'joint') {
        const dcr = await dcrApi.create({
          type,
          doctorId,
          accompaniedBy: type === 'joint' ? accompaniedBy : undefined,
          productsDetailed: productName.trim() ? [productName.trim()] : []
        });
        // Best-effort: keep the existing "what am I doing today" marker in sync. Its
        // failure must never hide that the actual DCR call above already succeeded.
        try {
          await workTypeApi.upsert({
            date, type,
            details: { doctorId, area: selectedDoctor?.area || '', product: productName.trim(), accompaniedBy: type === 'joint' ? accompaniedBy : undefined }
          });
        } catch { /* non-critical */ }
        setLogged(dcr);
      } else if (type === 'camp' || type === 'meeting') {
        const activityName = type === 'camp' ? campName.trim() : agenda.trim();
        const dcr = await dcrApi.create({
        type,
        activityName,
        venue: venue.trim(),
        productsDetailed: productName.trim() ? [productName.trim()] : []
      });
        try {
          await workTypeApi.upsert({
            date, type,
            details: type === 'camp' ? { campName, venue } : { agenda, venue }
          });
        } catch { /* non-critical */ }
        setLogged(dcr);
      } else {
        const details = {};
        if (type === 'sick' || type === 'leave') { details.leaveType = leaveType; details.fromDate = fromDate; details.toDate = toDate; details.reason = reason; }
        await workTypeApi.upsert({ date, type, details });
        setSaved(true);
      }
    } catch (err) {
      setError(err.uiMessage || err.message || 'Could not save your work type');
    } finally {
      setSubmitting(false);
    }
  };

  const isCallType = type === 'individual' || type === 'joint';
  const isLoggableType = isCallType || type === 'camp' || type === 'meeting';
  const canSubmit = isCallType
    ? Boolean(doctorId) && !(type === 'joint' && !accompaniedBy)
    : type === 'camp' ? Boolean(campName.trim())
    : type === 'meeting' ? Boolean(agenda.trim())
    : true;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={typography.title}>Today's Work Type</Text>
        <Text style={typography.subtitle}>{date}</Text>

        <View style={styles.grid}>
          {TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => changeType(t.value)}
              style={[styles.tile, type === t.value && styles.tileSelected]}
            >
              <t.icon size={22} color={type === t.value ? colors.primary : colors.muted} strokeWidth={1.75} />
              <Text style={[styles.tileLabel, type === t.value && styles.tileLabelSelected]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {isLoggableType && logged && (
          <Card style={styles.successCard}>
            <View style={styles.successHeader}>
              <CircleCheck size={22} color={colors.success} />
              <Text style={styles.successTitle}>{isCallType ? 'Call logged' : 'Activity logged'}</Text>
            </View>
            {isCallType ? (
              <>
                <Text style={styles.successDoctor}>{logged.doctorId?.name}</Text>
                <Text style={styles.successMeta}>{logged.doctorId?.area}</Text>
                {logged.productsDetailed?.[0] ? <Text style={styles.successMeta}>{logged.productsDetailed[0]}</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.successDoctor}>{logged.activityName}</Text>
                {logged.venue ? <Text style={styles.successMeta}>{logged.venue}</Text> : null}
              </>
            )}
            <StatusBadge label={logged.status} tone={logged.status === 'pending' ? 'warning' : 'success'} />
            <View style={styles.successActions}>
              <Button title="Log another" variant="outline" onPress={resetCallForm} style={styles.successBtn} />
              <Button title="Open DCR" onPress={() => navigation.navigate('DcrTab')} style={styles.successBtn} />
            </View>
          </Card>
        )}

        {isCallType && !logged && (
          <View style={styles.subForm}>
            <SelectField label="Doctor Name" value={doctorId} onChange={setDoctorId} options={doctorOptions} placeholder="Search doctor" searchable />
            {type === 'joint' && (
              <SelectField label="Accompanied by (manager)" value={accompaniedBy} onChange={setAccompaniedBy} options={managerOptions} placeholder="Select manager" />
            )}
            <FormField label="Area / Location" value={selectedDoctor?.area || ''} editable={false} placeholder="Select a doctor first" />
            <FormField label="Product Name" value={productName} onChangeText={setProductName} placeholder="e.g. Neurogain" />
          </View>
        )}

        {type === 'camp' && !logged && (
          <View style={styles.subForm}>
            <FormField label="Camp / event name" value={campName} onChangeText={setCampName} placeholder="e.g. Diabetes CME camp" />
            <FormField label="Venue" value={venue} onChangeText={setVenue} placeholder="Enter venue" />
            <FormField label="Product Name" value={productName} onChangeText={setProductName} placeholder="e.g. Neurogain" />
          </View>
        )}

        {type === 'meeting' && !logged && (
          <View style={styles.subForm}>
            <FormField label="Agenda / purpose" value={agenda} onChangeText={setAgenda} placeholder="Describe the agenda…" multiline numberOfLines={3} />
            <FormField label="Location" value={venue} onChangeText={setVenue} placeholder="Office / virtual / field" />
          </View>
        )}

        {(type === 'sick' || type === 'leave') && (
          <View style={styles.subForm}>
            <SelectField label="Leave type" value={leaveType} onChange={setLeaveType} options={LEAVE_TYPES} />
            <DateField label="From date" value={fromDate} onChange={setFromDate} />
            <DateField label="To date" value={toDate} onChange={setToDate} />
            <FormField label="Reason" value={reason} onChangeText={setReason} placeholder="Enter reason…" multiline numberOfLines={2} />
          </View>
        )}

        <ErrorBanner message={error} />
        {saved && <StatusBadge label="Work type saved" tone="success" />}
        {!(isLoggableType && logged) && (
          <Button icon={Send} title="Confirm & Log Call" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '31%', borderWidth: 2, borderColor: colors.line, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center', gap: 4, backgroundColor: colors.card },
  tileSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileLabel: { fontSize: 11, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  tileLabelSelected: { color: colors.primary },
  subForm: { gap: spacing.sm, backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  successCard: { gap: spacing.xs },
  successHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  successTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  successDoctor: { fontSize: 14, fontWeight: '600', color: colors.ink, marginTop: spacing.xs },
  successMeta: { fontSize: 12, color: colors.muted },
  successActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  successBtn: { flex: 1 }
});
