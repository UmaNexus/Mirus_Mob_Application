import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../../components/Card';
import { colors, spacing, typography } from '../../theme';
import useEntityHydration from '../../hooks/useEntityHydration';
import * as doctorsApi from '../../api/doctors';

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export default function DoctorDetailScreen({ route }) {
  const initialDoctor = route.params?.doctor;
  const doctorId = route.params?.doctorId || route.params?.id || initialDoctor?._id;

  const { data: doctor, loading } = useEntityHydration({
    initialEntity: initialDoctor,
    entityId: doctorId,
    fetcher: async (id) => {
      const list = await doctorsApi.listMine();
      return (list || []).find((d) => String(d._id) === String(id)) || null;
    }
  });

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!doctor) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <Text style={styles.emptyText}>Doctor details not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={typography.title}>{doctor.name}</Text>
          <Text style={typography.subtitle}>{doctor.speciality || 'No speciality on file'}</Text>
        </Card>
        <Card style={styles.detailsCard}>
          <Row label="Area" value={doctor.area || '—'} />
          <Row label="Phone" value={doctor.phone || '—'} />
          <Row label="Birthday" value={fmt(doctor.dob)} />
          <Row label="Anniversary" value={fmt(doctor.anniversaryDate)} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.md },
  detailsCard: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 12, color: colors.muted },
  rowValue: { fontSize: 13, color: colors.ink, fontWeight: '500' }
});
