import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import ErrorBanner from '../components/ErrorBanner';
import { colors, spacing, radii, typography } from '../theme';

/**
 * Real login screen — company code + email-or-employee-ID + password against
 * the existing `POST /api/auth/login`. Unlike the HTML demo, there is no
 * role picker: the role and field-force tier come back from the server on
 * `user` and drive navigation from there (see navigation/RootNavigator.js).
 */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [companySlug, setCompanySlug] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = companySlug.trim() && identifier.trim() && password && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn({ companySlug: companySlug.trim(), identifier: identifier.trim(), password });
    } catch (err) {
      setError(err.uiMessage || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>MIRUS</Text>
        <Text style={styles.brandSub}>Med Sciences Private Limited</Text>

        <View style={styles.form}>
          <Text style={typography.label}>Company code</Text>
          <TextInput
            style={styles.input}
            value={companySlug}
            onChangeText={setCompanySlug}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. mirus"
            placeholderTextColor={colors.muted}
          />

          <Text style={[typography.label, styles.spacedLabel]}>Employee ID / Email</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Employee ID or email"
            placeholderTextColor={colors.muted}
          />

          <Text style={[typography.label, styles.spacedLabel]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={colors.muted}
          />

          <ErrorBanner message={error} />

          <Button title="Log In" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} style={styles.submit} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { fontSize: 34, fontWeight: '900', color: colors.ink, textAlign: 'center', letterSpacing: 1 },
  brandSub: { fontSize: 12, color: colors.primary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xxl },
  form: { gap: spacing.xs },
  spacedLabel: { marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface
  },
  submit: { marginTop: spacing.xl }
});
