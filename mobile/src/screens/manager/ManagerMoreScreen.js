import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, ClipboardList, CalendarDays, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { displayName, resolveUserTier } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { colors, spacing, typography, iconSizes } from '../../theme';

export default function ManagerMoreScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const tier = resolveUserTier(user);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={typography.title}>More</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.name}>{displayName(user)}</Text>
          <Text style={styles.role}>
            {tier ? `${tier} · ${user?.employeeDetails?.fieldForce?.territory || 'MIRUS'}` : 'MIRUS'}
          </Text>
        </Card>

        <NavRow icon={ClipboardList} title="DCR Review" subtitle="Review your team's submitted daily call reports" onPress={() => navigation.navigate('DcrReview')} />
        <NavRow icon={CalendarDays} title="Status Calendar" subtitle="Your holidays, leave, and attendance for the month" onPress={() => navigation.navigate('Calendar')} />

        <Button icon={LogOut} title="Sign out" variant="outline" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

function NavRow({ icon: Icon, title, subtitle, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={styles.navRow}>
        <Icon size={iconSizes.header} color={colors.primary} />
        <View style={styles.navRowText}>
          <Text style={styles.navRowTitle}>{title}</Text>
          <Text style={styles.navRowSubtitle}>{subtitle}</Text>
        </View>
        <ChevronRight size={iconSizes.header} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { paddingBottom: spacing.xs },
  card: { gap: spacing.xs },
  name: { fontSize: 18, fontWeight: '700', color: colors.ink },
  role: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navRowText: { flex: 1 },
  navRowTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  navRowSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 }
});
