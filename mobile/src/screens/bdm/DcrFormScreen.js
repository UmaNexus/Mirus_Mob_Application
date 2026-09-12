import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import * as dcrApi from '../../api/dcr';
import * as doctorsApi from '../../api/doctors';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import Button from '../../components/Button';
import ErrorBanner from '../../components/ErrorBanner';
import LoadingView from '../../components/LoadingView';
import { colors, spacing } from '../../theme';

const SAVE_LABELS = { individual: 'Save individual call', joint: 'Save joint call', missed: 'Save missed visit' };

/**
 * One form for all three DCR types. Doctor choices come only from the
 * backend's own /doctors/mine (a BDM cannot type in an arbitrary doctor id —
 * the backend re-validates ownership regardless, but the picker itself only
 * ever offers doctors legitimately assigned to this BDM). The "accompanied
 * by" picker for joint calls is similarly restricted to /field-force/my-chain
 * — real managers in this BDM's own reporting chain, nothing else.
 */
export default function DcrFormScreen({ route, navigation }) {
  const { type } = route.params;
  const doctors = useAsync(doctorsApi.listMine, []);
  const chain = useAsync(type === 'joint' ? dcrApi.myChain : () => Promise.resolve([]), [type]);

  const [doctorId, setDoctorId] = useState(null);
  const [accompaniedBy, setAccompaniedBy] = useState(null);
  const [productsText, setProductsText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const doctorOptions = (doctors.data || []).map((d) => ({ label: d.name, value: d._id, sublabel: d.speciality }));
  const managerOptions = (chain.data || []).map((m) => ({
    label: `${m.personalDetails?.firstName || ''} ${m.personalDetails?.lastName || ''}`.trim(),
    value: m._id,
    sublabel: m.employeeDetails?.fieldForce?.tier
  }));

  const canSubmit = doctorId && (type !== 'joint' || accompaniedBy) && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await dcrApi.create({
        type,
        doctorId,
        accompaniedBy: type === 'joint' ? accompaniedBy : undefined,
        productsDetailed: productsText ? productsText.split(',').map((s) => s.trim()).filter(Boolean) : [],
        feedback
      });
      navigation.goBack();
    } catch (err) {
      setError(err.uiMessage || err.message || 'Could not save this call');
    } finally {
      setSubmitting(false);
    }
  };

  if (doctors.status === 'loading' || (type === 'joint' && chain.status === 'loading')) return <LoadingView />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {doctors.status === 'error' && <ErrorBanner message={doctors.error} />}
        {doctors.data?.length === 0 && <ErrorBanner message="You have no assigned doctors yet — ask your manager to assign one." />}

        <SelectField label="Doctor" value={doctorId} onChange={setDoctorId} options={doctorOptions} placeholder="Select doctor" />

        {type === 'joint' && (
          <SelectField
            label="Accompanied by"
            value={accompaniedBy}
            onChange={setAccompaniedBy}
            options={managerOptions}
            placeholder={managerOptions.length ? 'Select manager' : 'No manager in your reporting chain'}
            disabled={managerOptions.length === 0}
          />
        )}

        {type !== 'missed' && (
          <>
            <FormField label="Products detailed (comma separated)" value={productsText} onChangeText={setProductsText} placeholder="e.g. Cardivax 5mg, Neurogain" />
            <FormField label="Doctor feedback / remarks" value={feedback} onChangeText={setFeedback} placeholder="Add remarks…" multiline numberOfLines={3} />
          </>
        )}
        {type === 'missed' && (
          <FormField label="Reason" value={feedback} onChangeText={setFeedback} placeholder="Why was this visit missed?" multiline numberOfLines={3} />
        )}

        <ErrorBanner message={error} />
        <Button title={SAVE_LABELS[type]} onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md }
});
