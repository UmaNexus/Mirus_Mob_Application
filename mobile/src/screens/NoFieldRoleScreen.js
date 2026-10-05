import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import BrandLogo from '../components/BrandLogo';
import { colors, spacing, typography } from '../theme';

/**
 * Shown when the signed-in account has no valid field-force role (no job role assigned, or the
 * assigned role is inactive/removed/not a field role). The server is the authority — field-force
 * endpoints answer 403 for such users — so this is a clean, non-crashing landing page.
 */
export default function NoFieldRoleScreen() {
  const { signOut, user } = useAuth();
  const { roleName, reason } = user?.fieldAccess || {};
  // Only shown when the SERVER found no valid field role (no job role, a job role that does not
  // resolve to an active role of this company, or a role without field-force access).
  const message = reason === 'NOT_A_FIELD_ROLE' && roleName
    ? `Your role "${roleName}" does not have access to the field-force app.`
    : reason === 'JOB_ROLE_UNRESOLVED'
      ? 'Your assigned job role could not be found or is inactive.'
      : 'Your account does not have a job role assigned yet.';
  return (
    <SafeAreaView style={styles.container}>
      <BrandLogo variant="mark" size={56} style={styles.logo} />
      <Text style={typography.title}>No field-force role assigned</Text>
      <Text style={[typography.body, styles.body]}>
        {message} Please contact your administrator.
      </Text>
      <View style={styles.actions}>
        <Button icon={LogOut} title="Sign out" variant="outline" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.surface },
  logo: { marginBottom: spacing.xl },
  body: { textAlign: 'center', marginTop: spacing.md },
  actions: { marginTop: spacing.xl, alignSelf: 'stretch' }
});
