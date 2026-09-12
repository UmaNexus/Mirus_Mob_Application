import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { displayName } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { colors, radii, spacing, typography } from '../../theme';

const ITEMS = [
  { icon: '💰', label: 'Expenses', screen: 'Expenses' },
  { icon: '📌', label: 'Work Type', screen: 'WorkType' },
  { icon: '📦', label: 'Stockists', screen: 'Stockists' },
  { icon: '📈', label: 'Secondary Sales', screen: 'SecondarySales' },
  { icon: '📆', label: 'Calendar', screen: 'Calendar' },
  { icon: '🔔', label: 'Alerts', screen: 'Alerts' }
];

export default function MoreScreen({ navigation }) {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>More</Text>
      </View>
      <View style={styles.grid}>
        {ITEMS.map((item) => (
          <Card key={item.screen} style={styles.item} onPress={() => navigation.navigate(item.screen)}>
            <Text style={styles.itemIcon}>{item.icon}</Text>
            <Text style={styles.itemLabel}>{item.label}</Text>
          </Card>
        ))}
      </View>

      <Card style={styles.account}>
        <Text style={typography.body}>{displayName(user)}</Text>
        <Text style={typography.subtitle}>BDM · {user?.employeeDetails?.fieldForce?.territory || 'MIRUS'}</Text>
        <Button title="Sign out" variant="outline" onPress={signOut} style={styles.signOutBtn} />
      </Card>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg },
  item: { width: '47%', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  itemIcon: { fontSize: 24 },
  itemLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  account: { margin: spacing.lg, gap: spacing.xs },
  signOutBtn: { marginTop: spacing.sm }
});
