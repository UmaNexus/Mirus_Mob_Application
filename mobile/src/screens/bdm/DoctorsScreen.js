import React from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as doctorsApi from '../../api/doctors';
import Card from '../../components/Card';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography } from '../../theme';

/**
 * A BDM's assigned doctors — view-only, per the backend's ownership scope
 * (GET /api/doctors/mine only ever returns doctors with assignedTo=self).
 * No CSV import, no assignment controls — that management functionality is
 * ASM+ only and does not belong in the BDM UI.
 */
export default function DoctorsScreen({ navigation }) {
  const doctors = useAsync(doctorsApi.listMine, []);
  useRefreshOnFocus(doctors.reload);

  if (doctors.status === 'loading') return <LoadingView />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Doctors</Text>
        <Text style={typography.subtitle}>Assigned to you</Text>
      </View>
      {doctors.status === 'error' && <ErrorBanner message={doctors.error} />}
      <FlatList
        contentContainerStyle={styles.list}
        data={doctors.data || []}
        keyExtractor={(item) => item._id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={doctors.reload} />}
        ListEmptyComponent={
          doctors.status === 'success' ? <EmptyState icon="👨‍⚕️" title="No doctors assigned yet" subtitle="Your manager assigns doctors to you." /> : null
        }
        renderItem={({ item }) => (
          <Card style={styles.row} onPress={() => navigation.navigate('DoctorDetail', { doctor: item })}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{[item.speciality, item.area].filter(Boolean).join(' · ') || 'No details'}</Text>
            {item.phone ? <Text style={styles.meta}>📞 {item.phone}</Text> : null}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: { gap: 2 },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted }
});
