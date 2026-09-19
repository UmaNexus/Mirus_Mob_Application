import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Upload, Plus, Check, Stethoscope, RefreshCw } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as doctorsApi from '../../api/doctors';
import * as fieldForceApi from '../../api/fieldForce';
import Card from '../../components/Card';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import SelectField from '../../components/SelectField';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import SuccessBanner from '../../components/SuccessBanner';
import EmptyState from '../../components/EmptyState';
import { colors, radii, spacing, typography } from '../../theme';

const emptyForm = { name: '', speciality: '', area: '', phone: '', assignedTo: null };

/**
 * Manager (ASM+) doctor assignment. Every doctor and every "assign to"
 * candidate shown here comes from the server already scoped to the caller's
 * own reporting subtree (GET /api/doctors and GET /api/field-force/team) —
 * this screen has no way to display or target anyone outside it, and every
 * write is re-checked server-side (canAccessFieldOpsUser) regardless.
 */
const TABS = [
  { value: 'all', label: 'All Doctors' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'byBdm', label: 'By BDM' }
];

export default function DoctorAssignmentScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [byBdmFilter, setByBdmFilter] = useState(null);

  // The server is the only source of "unassigned"/"assigned to this exact
  // BDM" truth — 'assigned' (any BDM) is filtered client-side over the same
  // already-subtree-scoped list, since there's no dedicated server filter
  // for "has any assignee" and the list is already bounded to the caller's
  // own authorized doctors.
  const doctors = useAsync(
    () => doctorsApi.listManaged({
      search: search.trim() || undefined,
      unassigned: tab === 'unassigned' ? true : undefined,
      assignedTo: tab === 'byBdm' && byBdmFilter ? byBdmFilter : undefined
    }),
    [search, tab, byBdmFilter]
  );
  const team = useAsync(fieldForceApi.getTeam, []);
  useRefreshOnFocus(doctors.reload);
  useRefreshOnFocus(team.reload);

  const bdmOptions = useMemo(
    () => (team.data || [])
      .filter((u) => u.employeeDetails?.fieldForce?.tier === 'BDM')
      .map((u) => ({ label: `${u.personalDetails?.firstName || ''} ${u.personalDetails?.lastName || ''}`.trim() || u.email, value: u._id })),
    [team.data]
  );
  const bdmNameById = useMemo(() => new Map(bdmOptions.map((o) => [o.value, o.label])), [bdmOptions]);

  const visibleDoctors = useMemo(() => {
    const data = doctors.data || [];
    if (tab === 'assigned') return data.filter((d) => d.assignedTo);
    if (tab === 'byBdm' && !byBdmFilter) return [];
    return data;
  }, [doctors.data, tab, byBdmFilter]);

  const changeTab = (value) => { setTab(value); if (value !== 'byBdm') setByBdmFilter(null); };

  const [mode, setMode] = useState(null); // null | 'create'
  const [form, setForm] = useState(emptyForm);
  const [reassigningId, setReassigningId] = useState(null);
  const [pendingAssignee, setPendingAssignee] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkAssignee, setBulkAssignee] = useState(null);

  const openCreate = () => { setForm(emptyForm); setMode('create'); setError(null); };
  const closeForm = () => { setMode(null); setForm(emptyForm); setError(null); };

  const handleCreate = async () => {
    setError(null); setBusy(true);
    try {
      await doctorsApi.create({ ...form, assignedTo: form.assignedTo || undefined });
      closeForm();
      setSuccess('Doctor added.');
      await doctors.reload();
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReassign = async (doctorId) => {
    setError(null); setBusy(true);
    try {
      await doctorsApi.update(doctorId, { assignedTo: pendingAssignee || null });
      setReassigningId(null);
      setPendingAssignee(null);
      setSuccess('Assignment updated.');
      await doctors.reload();
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignee || selectedIds.size === 0) return;
    setError(null); setBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => doctorsApi.update(id, { assignedTo: bulkAssignee })));
      setSuccess(`Assigned ${selectedIds.size} doctor(s).`);
      setSelectedIds(new Set());
      setSelectMode(false);
      setBulkAssignee(null);
      await doctors.reload();
    } catch (err) {
      setError(err.uiMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <FormField value={search} onChangeText={setSearch} placeholder="Search doctors…" style={styles.search} />
        <View style={styles.headerActions}>
          <Button icon={Upload} title="Bulk Import" variant="outline" onPress={() => navigation.navigate('ImportDoctors')} style={styles.headerBtn} />
          <Button icon={mode ? undefined : Plus} title={mode ? 'Cancel' : 'Add Doctor'} variant="ghost" onPress={mode ? closeForm : openCreate} style={styles.headerBtn} />
        </View>
        <Pressable onPress={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}>
          <Text style={styles.selectToggle}>{selectMode ? 'Cancel bulk assignment' : 'Bulk assign selected doctors'}</Text>
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t.value} onPress={() => changeTab(t.value)} style={[styles.tab, tab === t.value && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.value && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'byBdm' && (
        <View style={styles.byBdmRow}>
          <SelectField value={byBdmFilter} onChange={setByBdmFilter} options={bdmOptions} placeholder="Choose a BDM to filter by" />
        </View>
      )}

      {mode === 'create' && (
        <Card style={styles.formCard}>
          <FormField label="Doctor name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Dr. Sanjay Mehta" />
          <FormField label="Specialization" value={form.speciality} onChangeText={(v) => setForm((f) => ({ ...f, speciality: v }))} placeholder="e.g. Cardiologist" />
          <FormField label="Area / Territory" value={form.area} onChangeText={(v) => setForm((f) => ({ ...f, area: v }))} placeholder="e.g. Pune West" />
          <FormField label="Phone" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="Optional" keyboardType="phone-pad" />
          <SelectField label="Assign to BDM" value={form.assignedTo} onChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))} options={bdmOptions} placeholder="Leave unassigned" />
          <ErrorBanner message={error} />
          <Button title="Save doctor" onPress={handleCreate} loading={busy} disabled={!form.name.trim()} />
        </Card>
      )}

      {selectMode && (
        <Card style={styles.bulkCard}>
          <Text style={typography.label}>{selectedIds.size} selected</Text>
          <SelectField label="Assign selected to" value={bulkAssignee} onChange={setBulkAssignee} options={bdmOptions} placeholder="Choose a BDM" />
          <Button title="Assign" onPress={handleBulkAssign} loading={busy} disabled={!bulkAssignee || selectedIds.size === 0} />
        </Card>
      )}

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {(doctors.status === 'loading' || team.status === 'loading') && <LoadingView />}
      {doctors.status === 'error' && <ErrorBanner message={doctors.error} />}

      <FlatList
        contentContainerStyle={styles.list}
        data={visibleDoctors}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={
          doctors.status === 'success' ? (
            <EmptyState
              icon={Stethoscope}
              title={tab === 'byBdm' && !byBdmFilter ? 'Choose a BDM to see their doctors' : 'No doctors found'}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <Pressable onPress={() => selectMode && toggleSelected(item._id)} style={styles.rowTop}>
              {selectMode && (
                <View style={[styles.checkbox, selectedIds.has(item._id) && styles.checkboxChecked]}>
                  {selectedIds.has(item._id) ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{[item.speciality, item.area].filter(Boolean).join(' · ') || 'No details'}</Text>
                <Text style={styles.assignee}>
                  {item.assignedTo ? `Assigned to: ${bdmNameById.get(item.assignedTo) || 'Outside your BDM list'}` : 'Unassigned'}
                </Text>
              </View>
            </Pressable>

            {!selectMode && reassigningId !== item._id && (
              <Button icon={RefreshCw} title="Reassign" variant="ghost" onPress={() => { setReassigningId(item._id); setPendingAssignee(item.assignedTo || null); }} />
            )}
            {reassigningId === item._id && (
              <View style={styles.reassignRow}>
                <SelectField value={pendingAssignee} onChange={setPendingAssignee} options={bdmOptions} placeholder="Choose a BDM" />
                <View style={styles.reassignActions}>
                  <Button title="Cancel" variant="outline" onPress={() => setReassigningId(null)} style={styles.reassignBtn} />
                  <Button title="Save" onPress={() => handleReassign(item._id)} loading={busy} style={styles.reassignBtn} />
                </View>
              </View>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  search: { marginBottom: 0 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { flex: 1 },
  selectToggle: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.white },
  byBdmRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  formCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  bulkCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
  assignee: { fontSize: 11, color: colors.primary, marginTop: 2, fontWeight: '600' },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  reassignRow: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  reassignActions: { flexDirection: 'row', gap: spacing.sm },
  reassignBtn: { flex: 1 }
});
