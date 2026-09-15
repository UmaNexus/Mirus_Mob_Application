import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Paperclip, CircleCheck, TriangleAlert, CircleX, Check } from 'lucide-react-native';
import * as doctorsApi from '../../api/doctors';
import Card from '../../components/Card';
import Button from '../../components/Button';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import { colors, radii, spacing, typography, iconSizes } from '../../theme';

const STATUS_ICON = { ok: CircleCheck, warning: TriangleAlert, error: CircleX };
const STATUS_COLOR = { ok: colors.success, warning: colors.warning, error: colors.danger };

/**
 * Excel → Upload → Parse → Validate → Preview → Confirm, per the required
 * bulk-assignment workflow. Nothing is written to the database until the
 * user explicitly taps "Confirm Import" — `previewImportDoctors` on the
 * backend only ever reads, and `confirmImportDoctors` re-validates every row
 * from scratch server-side rather than trusting this screen's preview data.
 */
export default function ImportDoctorsScreen({ navigation }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { summary, rows }
  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState(null); // { created, updated, failed }
  const [error, setError] = useState(null);

  const importableRows = useMemo(() => (preview?.rows || []).filter((r) => r.status !== 'error'), [preview]);

  const pickFile = async () => {
    setError(null); setPreview(null); setResult(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
    });
    if (!picked.canceled && picked.assets?.[0]) {
      const asset = picked.assets[0];
      setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setError(null); setPreviewing(true); setResult(null);
    try {
      const data = await doctorsApi.previewImport(file);
      setPreview(data);
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!importableRows.length) return;
    setError(null); setConfirming(true);
    try {
      const data = await doctorsApi.confirmImport(importableRows);
      setResult(data);
      setPreview(null);
      setFile(null);
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.gap}>
          <Text style={typography.label}>1. Upload roster</Text>
          <Text style={styles.hint}>Columns: Doctor, Specialization, Area, Phone, Assign to BDM (employee ID or email)</Text>
          <Button icon={Paperclip} title={file ? file.name : 'Choose .xlsx file'} variant="outline" onPress={pickFile} />
          <Button title="Preview" onPress={handlePreview} loading={previewing} disabled={!file} />
        </Card>

        <ErrorBanner message={error} />

        {preview && (
          <Card style={styles.gap}>
            <Text style={typography.label}>2. Preview ({preview.summary.total} rows)</Text>
            <View style={styles.summaryRow}>
              <SummaryChip label="OK" value={preview.summary.ok} color={colors.success} />
              <SummaryChip label="Warnings" value={preview.summary.warning} color={colors.warning} />
              <SummaryChip label="Errors" value={preview.summary.error} color={colors.danger} />
            </View>

            {preview.rows.map((row) => {
              const RowIcon = STATUS_ICON[row.status];
              return (
                <View key={row.row} style={styles.rowItem}>
                  <RowIcon size={iconSizes.card} color={STATUS_COLOR[row.status]} style={styles.rowIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Row {row.row} — {row.name || '(no name)'}</Text>
                    <Text style={[styles.rowMessage, { color: STATUS_COLOR[row.status] }]}>{row.message}</Text>
                  </View>
                </View>
              );
            })}

            <Button
              icon={Check}
              title={`Confirm Import (${importableRows.length})`}
              onPress={handleConfirm}
              loading={confirming}
              disabled={importableRows.length === 0}
            />
          </Card>
        )}

        {result && (
          <Card style={styles.gap}>
            <SuccessBanner message={`${result.created.length} created, ${result.updated.length} updated, ${result.failed.length} failed`} />
            {result.failed.map((f) => (
              <Text key={f.row} style={styles.rowMessage}>Row {f.row} — {f.name}: {f.error}</Text>
            ))}
            <Button title="Done" onPress={() => navigation.goBack()} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryChip({ label, value, color }) {
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  gap: { gap: spacing.sm },
  hint: { fontSize: 12, color: colors.muted },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { flex: 1, borderWidth: 1, borderRadius: radii.md, alignItems: 'center', paddingVertical: spacing.sm },
  chipValue: { fontSize: 18, fontWeight: '700' },
  chipLabel: { fontSize: 10, color: colors.muted },
  rowItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  rowIcon: { marginTop: 2 },
  rowTitle: { fontSize: 12, fontWeight: '600', color: colors.ink },
  rowMessage: { fontSize: 11, color: colors.muted }
});
