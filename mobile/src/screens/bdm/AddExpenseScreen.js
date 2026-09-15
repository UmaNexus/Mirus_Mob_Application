import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Paperclip } from 'lucide-react-native';
import * as expensesApi from '../../api/expenses';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import DateField from '../../components/DateField';
import Button from '../../components/Button';
import ErrorBanner from '../../components/ErrorBanner';
import { colors, spacing, radii, typography } from '../../theme';

const CATEGORIES = [
  { label: 'Travel', value: 'Travel' }, { label: 'Food / DA', value: 'Food' },
  { label: 'Accommodation', value: 'Stay' }, { label: 'Internet', value: 'Internet' }, { label: 'Miscellaneous', value: 'Misc' }
];
const STATION_TYPES = [{ label: 'Metro', value: 'Metro' }, { label: 'Non-Metro', value: 'Non-Metro' }];

export default function AddExpenseScreen({ navigation }) {
  const [category, setCategory] = useState('Travel');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stationType, setStationType] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [modeOfTravel, setModeOfTravel] = useState('');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = category && date && Number(amount) > 0 && !submitting;

  const pickReceipt = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'] });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setReceipt({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await expensesApi.create({ category, date, amount, stationType, from, to, modeOfTravel, receipt });
      navigation.goBack();
    } catch (err) {
      setError(err.uiMessage || err.message || 'Could not submit this expense');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SelectField label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
        <DateField label="Date" value={date} onChange={setDate} />
        {category === 'Travel' && (
          <>
            <SelectField label="Station type" value={stationType} onChange={setStationType} options={STATION_TYPES} placeholder="Optional" />
            <FormField label="From" value={from} onChangeText={setFrom} placeholder="e.g. Pune" />
            <FormField label="To" value={to} onChangeText={setTo} placeholder="e.g. Mumbai" />
            <FormField label="Mode of travel" value={modeOfTravel} onChangeText={setModeOfTravel} placeholder="Train / Bus / Auto / Own vehicle" />
          </>
        )}
        <FormField label="Amount (₹)" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

        <View style={styles.receiptGroup}>
          <Text style={typography.label}>Receipt (optional)</Text>
          <Button icon={Paperclip} title={receipt ? receipt.name : 'Attach receipt (photo/PDF)'} variant="outline" onPress={pickReceipt} />
        </View>

        <ErrorBanner message={error} />
        <Button title="Save expense" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  receiptGroup: { gap: spacing.xs }
});
