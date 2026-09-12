import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as stockistsApi from '../../api/stockists';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import DateField from '../../components/DateField';
import SelectField from '../../components/SelectField';
import StatusBadge from '../../components/StatusBadge';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../theme';

const rupees = (paisa) => `₹${Math.round(paisa / 100).toLocaleString('en-IN')}`;
const STATUS_OPTIONS = [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }];

const emptyForm = { name: '', area: '', lastOrderAmount: '', lastOrderDate: '', status: 'Active' };

export default function StockistsScreen() {
  const stockists = useAsync(stockistsApi.listMine, []);
  useRefreshOnFocus(stockists.reload);
  const [mode, setMode] = useState(null); // null | 'create' | { editingId }
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const openCreate = () => { setForm(emptyForm); setMode('create'); setError(null); };
  const openEdit = (item) => {
    setForm({
      name: item.name, area: item.area || '',
      lastOrderAmount: item.lastOrderAmount ? String(Math.round(item.lastOrderAmount / 100)) : '',
      lastOrderDate: item.lastOrderDate ? item.lastOrderDate.slice(0, 10) : '', status: item.status
    });
    setMode({ editingId: item._id });
    setError(null);
  };
  const closeForm = () => { setMode(null); setForm(emptyForm); setError(null); };

  const handleSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload = { name: form.name, area: form.area, lastOrderAmount: form.lastOrderAmount || undefined, lastOrderDate: form.lastOrderDate || undefined };
      if (mode === 'create') {
        await stockistsApi.create(payload);
      } else {
        await stockistsApi.update(mode.editingId, { ...payload, status: form.status });
      }
      closeForm();
      await stockists.reload();
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isEditing = mode && mode !== 'create';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={typography.title}>Stockists</Text>
          <Text style={typography.subtitle}>Secondary sales</Text>
        </View>
        <Button title={mode ? 'Cancel' : '+ Add'} variant="ghost" onPress={mode ? closeForm : openCreate} />
      </View>

      {mode && (
        <Card style={styles.formCard}>
          <FormField label="Stockist name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Mehta Pharma Distributors" />
          <FormField label="Area" value={form.area} onChangeText={(v) => setForm((f) => ({ ...f, area: v }))} placeholder="Optional" />
          <FormField label="Last order amount (₹)" value={form.lastOrderAmount} onChangeText={(v) => setForm((f) => ({ ...f, lastOrderAmount: v }))} placeholder="Optional" keyboardType="decimal-pad" />
          <DateField label="Last order date" value={form.lastOrderDate} onChange={(v) => setForm((f) => ({ ...f, lastOrderDate: v }))} />
          {isEditing && <SelectField label="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} options={STATUS_OPTIONS} />}
          <ErrorBanner message={error} />
          <Button title={isEditing ? 'Save changes' : 'Save stockist'} onPress={handleSave} loading={submitting} disabled={!form.name.trim()} />
        </Card>
      )}

      {stockists.status === 'loading' && <LoadingView />}
      {stockists.status === 'error' && <ErrorBanner message={stockists.error} />}
      <FlatList
        contentContainerStyle={styles.list}
        data={stockists.data || []}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={stockists.status === 'success' ? <EmptyState icon="📦" title="No stockists yet" /> : null}
        renderItem={({ item }) => (
          <Card style={styles.row} onPress={() => openEdit(item)}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{item.name}</Text>
              <StatusBadge label={item.status} tone={item.status === 'Active' ? 'success' : 'neutral'} />
            </View>
            <Text style={styles.meta}>
              {item.lastOrderAmount ? `Last order: ${rupees(item.lastOrderAmount)}` : 'No orders recorded'}
              {item.lastOrderDate ? ` · ${new Date(item.lastOrderDate).toLocaleDateString()}` : ''}
            </Text>
            <Text style={styles.editHint}>Tap to edit</Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  formCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: { gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  editHint: { fontSize: 10, color: colors.primary, marginTop: 2 }
});
