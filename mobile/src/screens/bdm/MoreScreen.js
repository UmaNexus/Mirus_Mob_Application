import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Receipt, ListChecks, Store, ChartNoAxesCombined, CalendarDays, Bell, LogOut, Palmtree, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { displayName, roleNameOf } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import Button from '../../components/Button';
import BrandLogo from '../../components/BrandLogo';
import { openAccountDeletionInBrowser } from '../../config/legalUrls';
import { colors, radii, spacing, typography } from '../../theme';

const ITEMS = [
  { icon: Receipt, label: 'Expenses', screen: 'Expenses' },
  { icon: ListChecks, label: 'Work Type', screen: 'WorkType' },
  { icon: Store, label: 'Stockists', screen: 'Stockists' },
  { icon: ChartNoAxesCombined, label: 'Secondary Sales', screen: 'SecondarySales' },
  { icon: CalendarDays, label: 'Calendar', screen: 'Calendar' },
  { icon: Bell, label: 'Alerts', screen: 'Alerts' },
  { icon: Palmtree, label: 'Apply Leave', screen: 'ApplyLeave' },
  { icon: ShieldCheck, label: 'Privacy Policy', screen: 'PrivacyPolicy' }
];

export default function MoreScreen({ navigation }) {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BrandLogo variant="mark" size={22} />
        <Text style={typography.title}>More</Text>
      </View>
      <View style={styles.grid}>
        {ITEMS.map((item) => (
          <Card key={item.screen} style={styles.item} onPress={() => navigation.navigate(item.screen)}>
            <item.icon size={24} color={colors.primary} strokeWidth={1.75} />
            <Text style={styles.itemLabel}>{item.label}</Text>
          </Card>
        ))}
      </View>

      <Card style={styles.account}>
        <Text style={typography.body}>{displayName(user)}</Text>
        <Text style={typography.subtitle}>{roleNameOf(user) || 'Field'} · MIRUS</Text>
        <Button icon={LogOut} title="Sign out" variant="outline" onPress={signOut} style={styles.signOutBtn} />
      </Card>

      <View style={styles.legalFooter}>
        <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
          Privacy Policy
        </Text>
        <Text style={styles.legalDot}>•</Text>
        <Text style={styles.legalLink} onPress={openAccountDeletionInBrowser}>
          Data & Account Deletion
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg },
  item: { width: '47%', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  itemLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  account: { margin: spacing.lg, gap: spacing.xs, marginBottom: spacing.sm },
  signOutBtn: { marginTop: spacing.sm },
  legalFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg },
  legalLink: { fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },
  legalDot: { fontSize: 12, color: colors.muted }
});
