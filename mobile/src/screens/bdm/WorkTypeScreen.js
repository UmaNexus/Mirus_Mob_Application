import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import * as workTypeApi from '../../api/workType';
import * as doctorsApi from '../../api/doctors';
import * as dcrApi from '../../api/dcr';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import DateField from '../../components/DateField';
import Button from '../../components/Button';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import { colors, radii, spacing, typography } from '../../theme';

const TYPES = [
  { value: 'individual', icon: '📋', label: 'Individual call' },
  { value: 'joint', icon: '👥', label: 'Joint call' },
  { value: 'camp', icon: '🏕', label: 'Special camp' },
  { value: 'meeting', icon: '🤝', label: 'Meeting' },
  { value: 'sick', icon: '🤒', label: 'Sick leave' },
  { value: 'leave', icon: '🏖', label: 'Planned leave' }
];

// The REAL LeaveRequest enum (server/models/LeaveRequest.js) — no invented
// CL/PL/SL values are offered here per the client's explicit decision.
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Other'].map((t) => ({ label: t, value: t }));

const today = () => new Date().toISOString().slice(0, 10);

export default function WorkTypeScreen() {
  const [type, setType] = useState('individual');
  const [date] = useState(today());
  const [area, setArea] = useState('');
  const [doctorId, setDoctorId] = useState(null);
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
  const [saved, setSaved] = useState(false);

  const doctors = useAsync(doctorsApi.listMine, []);
  const chain = useAsync(dcrApi.myChain, []);
  const doctorOptions = (doctors.data || []).map((d) => ({ label: d.name, value: d._id, sublabel: d.speciality }));
  const managerOptions = (chain.data || []).map((m) => ({
    label: `${m.personalDetails?.firstName || ''} ${m.personalDetails?.lastName || ''}`.trim(),
    value: m._id, sublabel: m.employeeDetails?.fieldForce?.tier
  }));

  const handleSubmit = async () => {
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const details = {};
      if (type === 'individual' || type === 'joint') { details.doctorId = doctorId; details.area = area; }
      if (type === 'joint') details.accompaniedBy = accompaniedBy;
      if (type === 'camp') { details.campName = campName; details.venue = venue; }
      if (type === 'meeting') { details.agenda = agenda; details.venue = venue; }
      if (type === 'sick' || type === 'leave') {
        details.leaveType = leaveType; details.fromDate = fromDate; details.toDate = toDate; details.reason = reason;
      }
      await workTypeApi.upsert({ date, type, details });
      setSaved(true);
    } catch (err) {
      setError(err.uiMessage || err.message || 'Could not save your work type');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={typography.title}>Today's Work Type</Text>
        <Text style={typography.subtitle}>{date}</Text>

        <View style={styles.grid}>
          {TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => { setType(t.value); setSaved(false); }}
              style={[styles.tile, type === t.value && styles.tileSelected]}
            >
              <Text style={styles.tileIcon}>{t.icon}</Text>
              <Text style={[styles.tileLabel, type === t.value && styles.tileLabelSelected]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {(type === 'individual' || type === 'joint') && (
          <View style={styles.subForm}>
            <SelectField label="Doctor / contact" value={doctorId} onChange={setDoctorId} options={doctorOptions} placeholder="Search doctor" />
            {type === 'joint' && (
              <SelectField label="Accompanied by (manager)" value={accompaniedBy} onChange={setAccompaniedBy} options={managerOptions} placeholder="Select manager" />
            )}
            <FormField label="Area / location" value={area} onChangeText={setArea} placeholder="e.g. Pune Central" />
          </View>
        )}

        {type === 'camp' && (
          <View style={styles.subForm}>
            <FormField label="Camp / event name" value={campName} onChangeText={setCampName} placeholder="e.g. Diabetes CME camp" />
            <FormField label="Venue" value={venue} onChangeText={setVenue} placeholder="Enter venue" />
          </View>
        )}

        {type === 'meeting' && (
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
        {saved && <SuccessBanner message="Work type saved ✓" />}
        <Button title="Confirm & log work type" onPress={handleSubmit} loading={submitting} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '31%', borderWidth: 2, borderColor: colors.line, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center', backgroundColor: colors.card },
  tileSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileIcon: { fontSize: 22, marginBottom: 4 },
  tileLabel: { fontSize: 11, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  tileLabelSelected: { color: colors.primary },
  subForm: { gap: spacing.sm, backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md }
});
