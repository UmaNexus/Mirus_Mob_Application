import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stethoscope, CalendarDays, LogOut } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { resolveUserTier, displayName, isManagerTier } from '../navigation/roleHelpers';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, spacing, typography } from '../theme';

/**
 * Foundation placeholder — confirms the full auth round-trip (login -> token
 * -> /auth/me -> role-aware landing) works end to end. A full per-tier
 * dashboard is still a later milestone; the manager-only quick actions below
 * exist only to reach the MTP doctor-assignment/review screens this task
 * requires — they are not a manager dashboard.
 */
export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const tier = resolveUserTier(user);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Card>
          <Text style={typography.title}>{displayName(user)}</Text>
          <Text style={typography.subtitle}>{tier ? `${tier} · MIRUS` : 'MIRUS'}</Text>
        </Card>

        {isManagerTier(user) ? (
          <Card style={styles.notice}>
            <Text style={typography.label}>Field-force management</Text>
            <View style={styles.quickGrid}>
              <Button icon={Stethoscope} title="Doctor Assignments" variant="outline" onPress={() => navigation.navigate('DoctorAssignment')} style={styles.quickItem} />
              <Button icon={CalendarDays} title="Team MTP" variant="outline" onPress={() => navigation.navigate('TeamMtp')} style={styles.quickItem} />
            </View>
          </Card>
        ) : (
          <Card style={styles.notice}>
            <Text style={typography.body}>
              Mobile foundation is set up — authentication, secure token storage, theming, and the API client are
              working. Your {tier || 'role'}-specific dashboard will land here in a later milestone.
            </Text>
          </Card>
        )}

        <Button icon={LogOut} title="Sign out" variant="outline" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  notice: { flex: 1, gap: spacing.sm },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickItem: { flexGrow: 1 }
});
