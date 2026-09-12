import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../../components/Card';
import { colors, spacing, typography } from '../../theme';

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export default function DoctorDetailScreen({ route }) {
  const { doctor } = route.params;

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
  content: { padding: spacing.lg, gap: spacing.md },
  detailsCard: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 12, color: colors.muted },
  rowValue: { fontSize: 13, color: colors.ink, fontWeight: '500' }
});
