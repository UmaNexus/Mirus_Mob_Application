import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { resolveUserTier, displayName } from '../navigation/roleHelpers';
import Card from '../components/Card';
import Button from '../components/Button';
import { colors, spacing, typography } from '../theme';

/**
 * Foundation placeholder — confirms the full auth round-trip (login -> token
 * -> /auth/me -> role-aware landing) works end to end. Real BDM/Manager/
 * Admin dashboards replace this per-tier in Milestones 6-8.
 */
export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const tier = resolveUserTier(user);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Card>
          <Text style={typography.title}>{displayName(user)}</Text>
          <Text style={typography.subtitle}>{tier ? `${tier} · MIRUS` : 'MIRUS'}</Text>
        </Card>

        <Card style={styles.notice}>
          <Text style={typography.body}>
            Mobile foundation is set up — authentication, secure token storage, theming, and the API client are
            working. Your {tier || 'role'}-specific dashboard will land here in the next milestone.
          </Text>
        </Card>

        <Button title="Sign out" variant="outline" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  notice: { flex: 1 }
});
