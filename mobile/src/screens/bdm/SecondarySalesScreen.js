import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as salesApi from '../../api/secondarySales';
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

const daysUntil = (date) => Math.round((new Date(date) - new Date()) / 86400000);
const emptyForm = { productName: '', batchNumber: '', expiryDate: '', quantity: '', stockistId: null };

export default function SecondarySalesScreen() {
  const sales = useAsync(salesApi.listMine, []);
  const stockists = useAsync(stockistsApi.listMine, []);
  useRefreshOnFocus(sales.reload);
  const [mode, setMode] = useState(null); // null | 'create' | { editingId }
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const stockistOptions = (stockists.data || []).map((s) => ({ label: s.name, value: s._id }));

  const openCreate = () => { setForm(emptyForm); setMode('create'); setError(null); };
  const openEdit = (item) => {
    setForm({
      productName: item.productName, batchNumber: item.batchNumber || '',
      expiryDate: item.expiryDate ? item.expiryDate.slice(0, 10) : '',
      quantity: item.quantity ? String(item.quantity) : '',
      stockistId: item.stockistId?._id || item.stockistId || null
    });
    setMode({ editingId: item._id });
    setError(null);
  };
  const closeForm = () => { setMode(null); setForm(emptyForm); setError(null); };

  const handleSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        productName: form.productName, batchNumber: form.batchNumber,
        expiryDate: form.expiryDate || undefined, quantity: form.quantity || undefined,
        stockistId: form.stockistId || undefined
      };
      if (mode === 'create') {
        await salesApi.create(payload);
      } else {
        await salesApi.update(mode.editingId, payload);
      }
      closeForm();
      await sales.reload();
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
          <Text style={typography.title}>Secondary Sales</Text>
          <Text style={typography.subtitle}>Batch & expiry tracking</Text>
        </View>
        <Button title={mode ? 'Cancel' : '+ Add'} variant="ghost" onPress={mode ? closeForm : openCreate} />
      </View>

      {mode && (
        <Card style={styles.formCard}>
          <FormField label="Product name" value={form.productName} onChangeText={(v) => setForm((f) => ({ ...f, productName: v }))} placeholder="e.g. Cardivax 5mg" />
          <FormField label="Batch number" value={form.batchNumber} onChangeText={(v) => setForm((f) => ({ ...f, batchNumber: v }))} placeholder="Optional" />
          <DateField label="Expiry date" value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} />
          <FormField label="Quantity" value={form.quantity} onChangeText={(v) => setForm((f) => ({ ...f, quantity: v }))} placeholder="Optional" keyboardType="number-pad" />
          <SelectField label="Stockist" value={form.stockistId} onChange={(v) => setForm((f) => ({ ...f, stockistId: v }))} options={stockistOptions} placeholder="Optional" />
          <ErrorBanner message={error} />
          <Button title={isEditing ? 'Save changes' : 'Save'} onPress={handleSave} loading={submitting} disabled={!form.productName.trim()} />
        </Card>
      )}

      {sales.status === 'loading' && <LoadingView />}
      {sales.status === 'error' && <ErrorBanner message={sales.error} />}
      <FlatList
        contentContainerStyle={styles.list}
        data={sales.data || []}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={sales.status === 'success' ? <EmptyState icon="📦" title="No batches recorded yet" /> : null}
        renderItem={({ item }) => {
          const remaining = item.expiryDate ? daysUntil(item.expiryDate) : null;
          const tone = remaining == null ? 'neutral' : remaining < 0 ? 'danger' : remaining <= 30 ? 'warning' : 'success';
          return (
            <Card style={styles.row} onPress={() => openEdit(item)}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.productName}{item.batchNumber ? ` — ${item.batchNumber}` : ''}</Text>
                {remaining != null && <StatusBadge label={remaining < 0 ? 'Expired' : `${remaining}d left`} tone={tone} />}
              </View>
              <Text style={styles.meta}>
                {item.expiryDate ? `Expiry: ${new Date(item.expiryDate).toLocaleDateString()}` : 'No expiry set'}
                {item.quantity ? ` · ${item.quantity} units` : ''}
                {item.stockistId?.name ? ` · ${item.stockistId.name}` : ''}
              </Text>
              <Text style={styles.editHint}>Tap to edit</Text>
            </Card>
          );
        }}
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
