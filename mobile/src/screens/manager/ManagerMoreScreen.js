import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { displayName, resolveUserTier } from '../../navigation/roleHelpers';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { colors, spacing, typography } from '../../theme';

export default function ManagerMoreScreen() {
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
          <Button
            icon={LogOut}
            title="Sign out"
            variant="outline"
            onPress={signOut}
            style={styles.signOutBtn}
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { paddingBottom: spacing.xs },
  card: { gap: spacing.xs },
  name: { fontSize: 18, fontWeight: '700', color: colors.ink },
  role: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  signOutBtn: { marginTop: spacing.md }
});
